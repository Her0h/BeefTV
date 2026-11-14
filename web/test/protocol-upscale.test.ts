import { expect, test } from "bun:test";
import { apiClient } from "../src/services/api/request";
import { useConfigStore, createModelChannel } from "../src/stores/use-config-store";
import { isProtocolUpscaleChannel, estimateProtocolUpscale } from "../src/services/api/protocol-upscale";
import { isAIUpscaleTask, isProtocolUpscaleTask } from "../src/lib/canvas/canvas-ai-upscale-task";
import { createDefaultUpscaleSettings, upscaleParamsForNode } from "../src/lib/canvas/canvas-upscale";
import { CanvasNodeType } from "../src/types/canvas";

test("processing channels require declared protocols; existing image and official channels stay distinct", () => {
    const original = createModelChannel({ id: "original", modelProfiles: [{ model: "image", capability: "image", protocol: "openai-image" }] });
    expect(isProtocolUpscaleChannel(original)).toBe(false);
    expect(isProtocolUpscaleChannel({ ...original, modelProfiles: [{ model: "enhance", capability: "image", protocol: "media-upscale-image" }] })).toBe(true);
    expect(isProtocolUpscaleChannel({ ...original, enabled: false, modelProfiles: [{ model: "enhance", capability: "image", protocol: "media-upscale-image" }] })).toBe(false);
});

test("source estimate uses owned resource metadata without submitting a model or charging a fake reservation", async () => {
    const oldConfig = useConfigStore.getState().config;
    const oldRequest = apiClient.request;
    const requests: string[] = [];
    useConfigStore.setState({ config: { ...oldConfig, channels: [createModelChannel({ id: "local", baseUrl: "http://127.0.0.1:8000", modelProfiles: [{ model: "enhance", capability: "image", protocol: "media-upscale-image" }] })] } });
    apiClient.request = (async req => {
        requests.push(req.url || "");
        return { status: 200, data: { code: 0, data: { resource: { id: "source", kind: "image", width: 512, height: 768 } } } };
    }) as typeof apiClient.request;
    try {
        const result = await estimateProtocolUpscale({ resourceId: "source", channelId: "local", mode: "precision", model: "enhance", scale: 2, targetResolution: 1440 });
        expect(result.output).toMatchObject({ width: 1440, height: 2160 });
        expect(result).toMatchObject({ reservation: 0, billingMode: "provider", cloudProcessing: false, generationSubmitted: false });
        expect(requests).toEqual(["/resources/source"]);
    } finally { apiClient.request = oldRequest; useConfigStore.setState({ config: oldConfig }); }
});

test("processing recovery uses original task identity and frozen target resolution", () => {
    const settings = { ...createDefaultUpscaleSettings("custom"), targetResolution: 1440 };
    const request = upscaleParamsForNode(settings, { id: "input", type: CanvasNodeType.Image, position: { x: 0, y: 0 }, width: 100, height: 100 }, "owned");
    expect(request.targetResolution).toBe(1440);
    const task = { type: "canvas_image", model: "enhance", operation: "image", inputJson: JSON.stringify({ metadata: { source: "canvas-protocol-upscale" } }) };
    expect(isAIUpscaleTask(task)).toBe(true);
    expect(isProtocolUpscaleTask({ inputJson: "malformed" })).toBe(false);
    expect(isProtocolUpscaleTask({ inputJson: "{}" })).toBe(false);
});
