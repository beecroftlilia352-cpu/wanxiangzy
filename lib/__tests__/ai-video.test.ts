import { describe, expect, it } from "vitest";

import {
  AI_VIDEO_DEFAULT_AUDIO_MODE,
  AI_VIDEO_DEFAULT_DURATION,
  getAiVideoAudioCreditCost,
  normalizeAiVideoAudioMode,
  normalizeAiVideoDuration,
  normalizeAiVideoGenerateAudio,
} from "@/lib/ai-video";

describe("ai-video defaults", () => {
  it("uses the stable no-audio Seedance defaults", () => {
    expect(AI_VIDEO_DEFAULT_DURATION).toBe(4);
    expect(AI_VIDEO_DEFAULT_AUDIO_MODE).toBe("off");
    expect(normalizeAiVideoDuration(undefined)).toBe(4);
    expect(normalizeAiVideoAudioMode(undefined)).toBe("off");
    expect(normalizeAiVideoGenerateAudio(undefined)).toBe(false);
    expect(getAiVideoAudioCreditCost({ duration: 4 })).toBe(0);
  });

  it("charges audio only when the user explicitly enables or references audio", () => {
    expect(normalizeAiVideoAudioMode("generated")).toBe("generated");
    expect(getAiVideoAudioCreditCost({ duration: 4, audioMode: "generated" })).toBe(2);
    expect(getAiVideoAudioCreditCost({ duration: 4, audioMode: "custom" })).toBe(2);
    expect(getAiVideoAudioCreditCost({ duration: 4, generateAudio: true })).toBe(2);
  });
});
