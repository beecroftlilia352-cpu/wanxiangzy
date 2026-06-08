import { describe, expect, it } from "vitest";

import {
  AI_VIDEO_ASPECT_RATIO_OPTIONS,
  AI_VIDEO_DEFAULT_AUDIO_MODE,
  AI_VIDEO_DEFAULT_ASPECT_RATIO,
  AI_VIDEO_DEFAULT_DURATION,
  AI_VIDEO_DEFAULT_FIXED_ASPECT_RATIO,
  AI_VIDEO_DURATION_OPTIONS,
  getClosestAiVideoAspectRatio,
  getAiVideoAudioCreditCost,
  normalizeAiVideoAudioMode,
  normalizeAiVideoDuration,
  normalizeAiVideoGenerateAudio,
} from "@/lib/ai-video";

describe("ai-video defaults", () => {
  it("uses the stable no-audio HappyHorse defaults", () => {
    expect(AI_VIDEO_DEFAULT_DURATION).toBe(5);
    expect(AI_VIDEO_DEFAULT_AUDIO_MODE).toBe("off");
    expect(AI_VIDEO_DEFAULT_ASPECT_RATIO).toBe("auto");
    expect(AI_VIDEO_DEFAULT_FIXED_ASPECT_RATIO).toBe("3:4");
    expect(normalizeAiVideoDuration(undefined)).toBe(5);
    expect(normalizeAiVideoAudioMode(undefined)).toBe("off");
    expect(normalizeAiVideoGenerateAudio(undefined)).toBe(false);
    expect(getAiVideoAudioCreditCost({ duration: 5 })).toBe(0);
    expect(AI_VIDEO_DURATION_OPTIONS.map((item) => item.value)).toEqual([3, 5, 10, 15]);
    expect(AI_VIDEO_ASPECT_RATIO_OPTIONS.map((item) => item.value)).toEqual(["auto", "3:4", "9:16", "1:1", "4:3", "16:9"]);
  });

  it("infers common video ratios from uploaded image dimensions", () => {
    expect(getClosestAiVideoAspectRatio(900, 1200)).toBe("3:4");
    expect(getClosestAiVideoAspectRatio(1080, 1920)).toBe("9:16");
    expect(getClosestAiVideoAspectRatio(1200, 1200)).toBe("1:1");
  });

  it("keeps HappyHorse native audio within the base video cost", () => {
    expect(normalizeAiVideoAudioMode("generated")).toBe("generated");
    expect(getAiVideoAudioCreditCost({ duration: 5, audioMode: "generated" })).toBe(0);
    expect(getAiVideoAudioCreditCost({ duration: 5, audioMode: "custom" })).toBe(0);
    expect(getAiVideoAudioCreditCost({ duration: 5, generateAudio: true })).toBe(0);
  });
});
