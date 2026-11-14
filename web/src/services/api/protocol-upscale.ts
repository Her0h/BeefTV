import { useConfigStore, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import { getResource } from "./resources";
import { submitBackendGenerationTask } from "./generation-task";
import type { UpscaleParams, UpscaleEstimate } from "./media-upscale";

export function isProtocolUpscaleChannel(channel?: ModelChannel) {
    return Boolean(channel?.enabled !== false && channel?.modelProfiles?.some(profile => profile.protocol === "media-upscale-image" || profile.protocol === "media-upscale-video"));
}
export function protocolUpscaleChannel(id: string) {
    return useConfigStore.getState().config.channels.find(channel => channel.id === id && isProtocolUpscaleChannel(channel));
}
export async function estimateProtocolUpscale(params: UpscaleParams): Promise<UpscaleEstimate> {
    const source = await getResource(params.resourceId);
    if (source.kind !== "image" && source.kind !== "video") throw new Error("超分需要图片或视频素材");
    const width = source.width || 0, height = source.height || 0;
    if (!width || !height) throw new Error("素材尺寸尚未读取，请重新导入或稍后重试");
    const ratio = (params.targetResolution || 1080) / Math.min(width, height);
    return { mediaType: source.kind as "image" | "video", source: { width, height, durationMs: source.durationMs },
        output: { width: Math.round(width * ratio), height: Math.round(height * ratio), durationMs: source.durationMs },
        reservation: 0, currency: "CNY", generationSubmitted: false, cloudProcessing: !["localhost", "127.0.0.1", "[::1]"].includes(new URL(protocolUpscaleChannel(params.channelId)!.baseUrl).hostname), billingMode: "provider" };
}
export async function createProtocolUpscaleTask(params: UpscaleParams & { clientOperationId: string; projectId: string; nodeId: string }) {
    const channel = protocolUpscaleChannel(params.channelId);
    if (!channel) throw new Error("超分协议渠道已停用，请重新选择");
    const profile = channel.modelProfiles?.find(item => item.model === params.model);
    const mode = profile?.capability;
    if (mode !== "image" && mode !== "video") throw new Error("此超分模型没有声明素材类型");
    const config: AiConfig = { ...useConfigStore.getState().config, model: `${channel.id}::${params.model}`,
        count: "1", size: String(params.targetResolution || 1080), vquality: `${params.targetResolution || 1080}p`, videoGenerateAudio: "true" };
    const media = { id: params.resourceId, name: "超分输入", type: mode === "image" ? "image/png" : "video/mp4", dataUrl: "", url: "", storageKey: `resource:${params.resourceId}` };
    return submitBackendGenerationTask({ projectId: params.projectId, mode, prompt: "Preserve source composition and identity. Enhance clarity.", config,
        referenceImages: mode === "image" ? [media] : [], referenceVideos: mode === "video" ? [media] : [],
        clientOperationId: params.clientOperationId, metadata: { nodeId: params.nodeId, source: "canvas-protocol-upscale" } });
}
