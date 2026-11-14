package generation

import (
	"context"
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestFractionalVideoDurationReachesOfficialProtocolMultipart(t *testing.T) {
	request := ProtocolRequestFromInput(Input{Mode: "video", Prompt: "move", Config: Config{Model: "generic-video", VideoSeconds: "2.5"}})
	if request.Duration != 2.5 || request.Output.Duration != 2.5 {
		t.Fatalf("fractional duration was lost: %+v", request)
	}
	spec, err := unifiedVideoAdapter(t, "openai-videos").BuildCreate(context.Background(), protocol.RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(spec.Body)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal(encoded, &body); err != nil {
		t.Fatal(err)
	}
	if body["seconds"] != "2.5" {
		t.Fatalf("multipart seconds = %#v, want 2.5", body["seconds"])
	}
}
