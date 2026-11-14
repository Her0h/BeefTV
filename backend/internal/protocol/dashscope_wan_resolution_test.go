package protocol

import (
	"context"
	"testing"
)

func TestDashscopeWanSendsNativeResolution(t *testing.T) {
	adapter := officialPackageAdapter(t, "dashscope-wan-video.beeftv-plugin", "dashscope-wan-video")
	for _, value := range []string{"720p", "1080p"} {
		create, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
			Model: "wan2.6-i2v", Prompt: "gentle camera push", Resolution: value, Duration: 5,
			Images: []MediaReference{{Role: "first_frame", DataURL: "data:image/png;base64,fixture"}},
		}})
		if err != nil {
			t.Fatal(err)
		}
		body := manifestTestBody(t, create)
		params := body["parameters"].(map[string]any)
		want := value[:len(value)-1] + "P"
		if params["resolution"] != want || params["duration"] != float64(5) {
			t.Fatalf("native video parameters = %#v", params)
		}
	}
}
