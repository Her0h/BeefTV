package modelcatalog

import (
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestFractionalDurationContractPreservesGridAndEnum(t *testing.T) {
	var config VideoDurationConfig
	if err := json.Unmarshal([]byte(`{"selection":"range","min":1.25,"max":4.75,"step":0.25,"default":2.5}`), &config); err != nil {
		t.Fatal(err)
	}
	if err := validateVideoDuration(config); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		value   float64
		allowed bool
	}{
		{1.25, true}, {2.5, true}, {4.75, true}, {2.6, false}, {1, false}, {5, false},
	} {
		if got := videoDurationAllowed(config, test.value); got != test.allowed {
			t.Fatalf("duration %g allowed=%t, want %t", test.value, got, test.allowed)
		}
	}
	integer := VideoDurationConfig{Selection: "range", Min: 1, Max: 5, Step: 1, Default: 5}
	if videoDurationAllowed(integer, 2.5) {
		t.Fatal("fractional support must not expand integer-only profiles")
	}
	enum := VideoDurationConfig{Selection: "enum", Values: []float64{1.25, 2.5, 4}, Default: 2.5}
	if err := validateVideoDuration(enum); err != nil || !videoDurationAllowed(enum, 2.5) || videoDurationAllowed(enum, 3) {
		t.Fatalf("invalid fractional enum: %v", err)
	}
}

func TestWorkflowDurationPreservesFractionalBoundsDefaultAndStep(t *testing.T) {
	var workflow protocol.ManifestWorkflow
	if err := json.Unmarshal([]byte(`{"id":"generic-video","providerId":"custom","capability":"video","parameters":[{"name":"duration","type":"number","mapping":"duration","min":1.25,"max":4.75,"step":0.25}],"defaults":{"duration":2.5}}`), &workflow); err != nil {
		t.Fatal(err)
	}
	video := &VideoCapabilityConfig{}
	applyProtocolWorkflowVideoCapability(video, workflow)
	if got := video.Duration; got.Min != 1.25 || got.Max != 4.75 || got.Step != .25 || got.Default != 2.5 {
		t.Fatalf("workflow duration was truncated: %+v", got)
	}
	if err := validateVideoDuration(video.Duration); err != nil {
		t.Fatal(err)
	}
}
