import { describe, expect, it } from "vitest";

import {
  clampVideoDuration,
  getVideoCreditCost,
  getVideoDurationOptions,
  getVideoModes,
  getVideoResolutions,
  resolveUpstreamVideoModel,
  supportsVideoMotionControl,
} from "@/lib/api/video-catalog";

describe("video catalog", () => {
  it("maps minimax resolutions to dedicated upstream model ids", () => {
    expect(resolveUpstreamVideoModel("minimax", "pro", "768p")).toBe("minimax-h3-768p");
    expect(resolveUpstreamVideoModel("minimax", "pro", "2k")).toBe("minimax-h3");
  });

  it("maps seedance tiers and resolutions to dedicated model ids", () => {
    expect(resolveUpstreamVideoModel("seedance", "mini", "720p")).toBe("doubao-seedance-2-0-mini-260615");
    expect(resolveUpstreamVideoModel("seedance", "fast", "480p")).toBe("doubao-seedance-2-0-fast-260128-480p");
    expect(resolveUpstreamVideoModel("seedance", "fast", "720p")).toBe("doubao-seedance-2-0-fast-260128");
    expect(resolveUpstreamVideoModel("seedance", "pro", "720p")).toBe("doubao-seedance-2-0-260128");
    expect(resolveUpstreamVideoModel("seedance", "pro", "1080p")).toBe("doubao-seedance-2-0-260128-1080p");
  });

  it("exposes the seedance tiers and minimax resolution options", () => {
    expect(getVideoModes("seedance").map((item) => item.value)).toEqual(["mini", "fast", "pro"]);
    expect(getVideoModes("minimax").map((item) => item.value)).toEqual(["pro"]);
    expect(getVideoResolutions("minimax", "pro").map((item) => item.value)).toEqual(["768p", "2k"]);
    expect(getVideoResolutions("seedance", "pro").map((item) => item.value)).toEqual(["720p", "1080p"]);
  });

  it("clamps provider durations and prices by provider", () => {
    expect(clampVideoDuration("minimax", 3)).toBe(5);
    expect(clampVideoDuration("seedance", 3)).toBe(4);
    expect(getVideoDurationOptions("minimax")).toEqual([5, 10, 15]);
    expect(getVideoCreditCost({ provider: "minimax", modelMode: "pro", resolution: "768p", duration: 3 })).toBe(15);
    expect(getVideoCreditCost({ provider: "seedance", modelMode: "pro", resolution: "1080p", duration: 5 })).toBe(100);
  });

  it("disables reference-video motion control for all providers", () => {
    expect(supportsVideoMotionControl("minimax")).toBe(false);
    expect(supportsVideoMotionControl("seedance")).toBe(false);
  });
});
