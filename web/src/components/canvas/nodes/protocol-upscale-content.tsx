import { useState } from "react";
import { Button, Select } from "antd";
import type { ModelChannel } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { createDefaultUpscaleSettings } from "@/lib/canvas/canvas-upscale";
import { useUpstreamNodes } from "../canvas-node-graph-context";
import { useCanvasNodeActions } from "../canvas-node-action-context";

export function ProtocolUpscaleContent({ node, theme, channel }: { node: CanvasNodeData; theme: CanvasTheme; channel: ModelChannel }) {
    const actions = useCanvasNodeActions();
    const upstream = useUpstreamNodes(node.id).filter(item => item.type === "image" || item.type === "video");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const defaults = createDefaultUpscaleSettings(channel.id);
    const settings = { ...defaults, ...node.metadata?.upscale, channelId: channel.id };
    const profiles = channel.modelProfiles || [];
    const selectedModel = (kind: "image" | "video") => {
        const choices = profiles.filter(item => item.capability === kind && item.protocol === `media-upscale-${kind}`);
        const chosen = choices.find(item => item.model === settings[kind].model) || choices[0];
        return chosen?.model || "";
    };
    settings.image = { ...settings.image, mode: "precision", model: selectedModel("image") };
    settings.video = { ...settings.video, mode: "precision", model: selectedModel("video") };
    const patch = (change: Partial<typeof settings>) => actions.updateMetadata?.(node.id, { upscale: { ...settings, ...change } });
    const run = async () => {
        if (busy) return;
        setBusy(true); setError("");
        try {
            patch({});
            await actions.startUpscaleBatch?.({ ...node, metadata: { ...node.metadata, upscale: settings } });
        } catch (cause) { setError(cause instanceof Error ? cause.message : "超分提交失败"); }
        finally { setBusy(false); }
    };
    return <div className="relative flex min-h-0 flex-1 flex-col gap-3 p-3 text-sm" style={{ color: theme.node.text }}>
        <span>{upstream.length} 项输入素材</span>
        {!upstream.length ? <p>连接图片或视频后开始超分。</p> : upstream.map(item => <span key={item.id} className="truncate" title={item.title}>{item.title}</span>)}
        <div className="absolute inset-x-0 top-full z-20 mt-3 space-y-3 rounded-[var(--r-lg)] border p-4" style={{ background: theme.node.panel, borderColor: theme.node.edge }}>
            {(["image", "video"] as const).filter(kind => upstream.some(item => item.type === kind)).map(kind => <Select key={kind} className="w-full" aria-label={`${kind === "image" ? "图片" : "视频"}超分模型`} value={settings[kind].model || undefined}
                options={profiles.filter(item => item.capability === kind && item.protocol === `media-upscale-${kind}`).map(item => ({ value: item.model, label: item.displayName || item.model }))}
                onChange={model => patch({ [kind]: { ...settings[kind], model } })} />)}
            <label className="flex items-center justify-between gap-3">输出短边<Select aria-label="超分输出短边" value={settings.targetResolution || 1080} options={[1080, 1440, 2160].map(value => ({ value, label: `${value}px` }))} onChange={targetResolution => patch({ targetResolution })} /></label>
            <p style={{ color: theme.node.muted }}>使用自带渠道执行，费用与能力以上游为准。结果另存，保留原素材。</p>
            {error ? <p role="alert" style={{ color: "var(--status-error)" }}>{error}</p> : null}
            <Button block type="primary" loading={busy} disabled={!upstream.length || upstream.some(item => !settings[item.type as "image" | "video"].model)} onClick={() => void run()}>{node.metadata?.upscaleBatch ? "查询 / 继续原批次" : "开始超分"}</Button>
        </div>
    </div>;
}
