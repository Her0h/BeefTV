import { describe, expect, test } from "bun:test";

import { normalizeVideoValue, sanitizeServerVideoCapability, videoDurationAllowed, videoDurationOptions, type VideoCapabilityConfig } from "../src/lib/model-capabilities-video";
import { normalizeVideoDuration, normalizeVideoRangeDuration } from "../src/lib/video-generation-options";
import { applyProtocolWorkflowVideoCapability } from "../src/lib/model-capabilities";

function catalog(duration: VideoCapabilityConfig["duration"]) {
    return sanitizeServerVideoCapability({
        references: { promptMaxChars: 8000, minImages: 0, maxImages: 6, maxImageBytes: 33554432, maxVideos: 0, maxVideoBytes: 0, maxVideoDurationSeconds: 0, maxAudios: 0, maxAudioBytes: 0, maxAudioDurationSeconds: 0 },
        duration,
        ratios: ["9:16"],
        defaultRatio: "9:16",
        resolutions: ["720p"],
        defaultResolution: "720p",
        generateAudio: { supported: false, default: true },
        watermark: { supported: false, default: false },
        operations: ["reference_to_video"],
        defaultOperation: "reference_to_video",
    });
}

describe("declared fractional video duration", () => {
    test("preserves a quarter-second declaration, saved value and generation selection", () => {
        const profile = catalog({ selection: "range", min: 1, max: 5, step: 0.25, default: 2.5 });
        expect(profile).not.toBeNull();
        expect(profile!.duration.step).toBe(0.25);
        expect(profile!.duration.default).toBe(2.5);
        const persisted = normalizeVideoDuration("2.5");
        expect(persisted).toBe("2.5");
        expect(normalizeVideoValue(profile!, { seconds: persisted, ratio: "9:16", resolution: "720p" }).seconds).toBe("2.5");
        expect(videoDurationAllowed(profile!, 2.5)).toBe(true);
        expect(videoDurationAllowed(profile!, 2.6)).toBe(false);
        expect(videoDurationOptions(profile!)).toContain(2.75);
    });

    test("quantizes only according to the declared fractional grid", () => {
        expect(normalizeVideoRangeDuration(2.6, 5, 1, 5, 0.25)).toBe(2.5);
        expect(normalizeVideoRangeDuration(2.7, 5, 1, 5, 0.25)).toBe(2.75);
        expect(normalizeVideoRangeDuration(7, 5, 1, 5, 0.25)).toBe(5);
        expect(normalizeVideoRangeDuration(1.3, 5, 1, 5, 0.1)).toBe(1.3);
    });

    test("keeps integer-only model behavior", () => {
        const profile = catalog({ selection: "range", min: 1, max: 5, step: 1, default: 5 });
        expect(normalizeVideoValue(profile!, { seconds: "2.5" }).seconds).toBe("2");
        expect(videoDurationAllowed(profile!, 2.5)).toBe(false);
        expect(videoDurationOptions(profile!)).toEqual([1, 2, 3, 4, 5]);
    });

    test("retains existing continuous fractional minimum semantics", () => {
        const profile = catalog({ selection: "range", min: 1, fractionalMin: 0.92, max: 15, step: 1, default: 5, continuous: true });
        expect(profile).not.toBeNull();
        expect(normalizeVideoValue(profile!, { seconds: "0.925" }).seconds).toBe("0.925");
        expect(videoDurationAllowed(profile!, 0.925)).toBe(true);
    });

    test("accepts explicit fractional enum values and rejects an invalid grid default", () => {
        const profile = catalog({ selection: "enum", values: [1.5, 2.5, 5], default: 2.5 });
        expect(profile).not.toBeNull();
        expect(normalizeVideoValue(profile!, { seconds: "2.5" }).seconds).toBe("2.5");
        expect(catalog({ selection: "range", min: 1, max: 5, step: 0.25, default: 2.6 })).toBeNull();
    });

    test("projects a workflow quarter-second range and default without truncation", () => {
        const profile = catalog({ selection: "range", min: 1, max: 5, step: 1, default: 5 })!;
        applyProtocolWorkflowVideoCapability(profile, {
            id: "reference-video", label: "Reference video", providerId: "local", capability: "video",
            parameters: [{ name: "duration", type: "number", min: 1, max: 5, step: 0.25 }],
            defaults: { duration: 2.5 },
        });
        expect(profile.duration).toEqual({ selection: "range", min: 1, max: 5, step: 0.25, default: 2.5 });
        expect(normalizeVideoValue(profile, { seconds: "2.75" }).seconds).toBe("2.75");
    });
});
