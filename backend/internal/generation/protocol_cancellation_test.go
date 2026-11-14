package generation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func cancellationFixture(t *testing.T, cancel, poll bool) *protocol.Registry {
	t.Helper()
	provider := map[string]any{
		"id": "fixture-video", "label": "Fixture", "capabilities": []string{"video"}, "scopes": []string{"canvas"},
		"auth":     map[string]any{"type": "bearer", "field": "apiKey"},
		"create":   map[string]any{"method": "POST", "path": "/v1/videos"},
		"response": map[string]any{"taskId": map[string]any{"$ref": "response.id"}, "status": map[string]any{"$ref": "response.status"}},
	}
	if cancel {
		provider["cancel"] = map[string]any{"method": "DELETE", "path": "/v1/videos/{{taskId}}"}
	}
	if poll {
		provider["poll"] = map[string]any{"method": "GET", "path": "/v1/videos/{{taskId}}"}
	}
	data, _ := json.Marshal(map[string]any{
		"apiVersion": "beeftv.plugin/v2", "id": "fixture", "name": "Fixture", "version": "1.0.0",
		"contributes": map[string]any{"providers": []any{provider}},
	})
	adapters, err := protocol.LoadInstalledProviders(data)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := protocol.NewRegistry(adapters...)
	if err != nil {
		t.Fatal(err)
	}
	return registry
}

func TestDeclaredCancellationRequiresPollAndCancel(t *testing.T) {
	for _, test := range []struct{ cancel, poll, supported bool }{
		{true, true, true}, {false, true, false}, {true, false, false},
	} {
		ctx := WithProtocolRegistry(context.Background(), cancellationFixture(t, test.cancel, test.poll))
		if got := SupportsProviderCancellationForContext(ctx, "fixture-video"); got != test.supported {
			t.Fatalf("cancel=%t poll=%t: support=%t", test.cancel, test.poll, got)
		}
	}
}

func TestDeclaredCancellationConfirmsOnlyExplicitTerminalState(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, test := range []struct {
		status string
		want   ProviderCancellationOutcome
	}{
		{"processing", ProviderCancellationPending},
		{"cancelled", ProviderCancellationConfirmed},
		{"completed", ProviderCancellationSucceeded},
		{"failed", ProviderCancellationFailed},
	} {
		t.Run(test.status, func(t *testing.T) {
			deletes, queries := 0, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/videos/ours-1" || r.Header.Get("Authorization") != "Bearer fixture-key" {
					t.Errorf("unexpected upstream request: %s %s", r.Method, r.URL.Path)
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				switch r.Method {
				case http.MethodDelete:
					deletes++
					w.WriteHeader(http.StatusNoContent)
				case http.MethodGet:
					queries++
					_ = json.NewEncoder(w).Encode(map[string]any{"id": "ours-1", "status": test.status})
				default:
					t.Errorf("unexpected method: %s", r.Method)
				}
			}))
			defer server.Close()
			ctx := WithProtocolRegistry(context.Background(), cancellationFixture(t, true, true))
			config := Config{InterfaceType: "fixture-video", Model: "local-video", BaseURL: server.URL, APIKey: "fixture-key"}
			if err := CancelProviderTask(ctx, config, "ours-1"); err != nil {
				t.Fatal(err)
			}
			outcome, _, err := QueryProviderCancellation(ctx, config, "ours-1")
			if err != nil {
				t.Fatal(err)
			}
			if deletes != 1 || queries != 1 || outcome != test.want {
				t.Fatalf("delete=%d query=%d outcome=%s, want %s", deletes, queries, outcome, test.want)
			}
		})
	}
}

func TestDeletedProviderRecordDoesNotProveCancellation(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	ctx := WithProtocolRegistry(context.Background(), cancellationFixture(t, true, true))
	_, _, err := QueryProviderCancellation(ctx, Config{InterfaceType: "fixture-video", BaseURL: server.URL}, "removed")
	if err == nil {
		t.Fatal("404 must remain unconfirmed, not become a cancelled task")
	}
}

func TestDeclaredCancellationRejectsMissingTaskIDWithoutRequest(t *testing.T) {
	ctx := WithProtocolRegistry(context.Background(), cancellationFixture(t, true, true))
	err := CancelProviderTask(ctx, Config{InterfaceType: "fixture-video", BaseURL: "https://unreachable.invalid"}, " ")
	if err == nil || !strings.Contains(err.Error(), "task ID") {
		t.Fatalf("expected missing task ID, got %v", err)
	}
}
