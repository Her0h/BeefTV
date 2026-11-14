import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { audioSettingsSummary, buildAudioSpeechRequest, normalizeAudioVoiceValue, resolveAudioSpeechSettings } from "../src/lib/audio-generation.ts";

describe("compatible speech voice IDs", () => {
    it("preserves an opaque custom voice ID through settings, summary and request", () => {
        const model = "custom-channel::local-speech";
        const settings = resolveAudioSpeechSettings(model, {
            audioVoice: "  character-voice-7  ",
            audioFormat: "wav",
            audioInstructions: "温暖自然",
        });
        assert.equal(settings.audioVoice, "character-voice-7");
        assert.equal(audioSettingsSummary({ model, ...settings }), "character-voice-7 · WAV · 1x");
        assert.deepEqual(buildAudioSpeechRequest({ model, ...settings }, "你好"), {
            model,
            input: "你好",
            voice: "character-voice-7",
            response_format: "wav",
            speed: 1,
            instructions: "温暖自然",
        });
    });

    it("preserves custom IDs for an OpenAI-compatible speech model too", () => {
        assert.equal(normalizeAudioVoiceValue("voice_opaque123", "gpt-4o-mini-tts"), "voice_opaque123");
        assert.equal(normalizeAudioVoiceValue("alloy", "gpt-4o-mini-tts"), "alloy");
        assert.equal(normalizeAudioVoiceValue("", "gpt-4o-mini-tts"), "alloy");
        assert.equal(normalizeAudioVoiceValue("中文", "gpt-4o-mini-tts"), "alloy");
    });

    it("retains existing MiniMax preset migration and cloned IDs", () => {
        assert.equal(normalizeAudioVoiceValue("alloy", "minimax-speech-2.8-hd"), "male-qn-qingse");
        assert.equal(normalizeAudioVoiceValue("male-qn-jingying", "minimax-speech-2.8-hd"), "male-qn-jingying");
        assert.equal(normalizeAudioVoiceValue("cloned-voice-abc", "minimax-speech-2.8-hd"), "cloned-voice-abc");
    });

    it("retains Seed-Audio automatic selection and custom speakers", () => {
        assert.equal(normalizeAudioVoiceValue("alloy", "seed-audio-1.0"), "auto");
        assert.equal(normalizeAudioVoiceValue("speaker-abc", "seed-audio-1.0"), "speaker-abc");
    });

    it("still omits voice for music generation", () => {
        assert.equal(normalizeAudioVoiceValue("character-voice-7", "minimax-music-v3.0"), "");
        assert.equal("voice" in buildAudioSpeechRequest({ model: "minimax-music-v3.0", audioVoice: "character-voice-7" }, "钢琴曲"), false);
    });
});
