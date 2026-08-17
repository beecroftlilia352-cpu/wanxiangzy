import { describe, expect, it } from "vitest";
import {
  AI_TOOL_SLUGS,
  AI_TOOL_UI_CONFIG,
  isAiToolSlug,
} from "@/features/ai-tools/tool-ui-config";

describe("AI toolbox UI catalog", () => {
  it("keeps the eight production tools in the intended order", () => {
    expect(AI_TOOL_SLUGS).toEqual([
      "matting",
      "upscale",
      "outpaint",
      "erase",
      "hand-foot-repair",
      "clothing-repair",
      "shoe-repair",
      "resize",
    ]);
    expect(new Set(AI_TOOL_SLUGS).size).toBe(8);
  });

  it("routes each tool to the correct processing capability", () => {
    expect(AI_TOOL_UI_CONFIG.matting.capability).toBe("segment");
    expect(AI_TOOL_UI_CONFIG.upscale.capability).toBe("upscale");
    expect(AI_TOOL_UI_CONFIG.outpaint.capability).toBe("outpaint");
    expect(AI_TOOL_UI_CONFIG.erase.capability).toBe("inpaint");
    expect(AI_TOOL_UI_CONFIG["hand-foot-repair"].capability).toBe("inpaint");
    expect(AI_TOOL_UI_CONFIG["clothing-repair"].capability).toBe("inpaint");
    expect(AI_TOOL_UI_CONFIG["shoe-repair"].capability).toBe("inpaint");
    expect(AI_TOOL_UI_CONFIG.resize.capability).toBe("resize");
  });

  it("maps public routes to the canonical provider operations", () => {
    expect(AI_TOOL_UI_CONFIG.matting.operation).toBe("matting");
    expect(AI_TOOL_UI_CONFIG["hand-foot-repair"].operation).toBe("repair-limbs");
    expect(AI_TOOL_UI_CONFIG["clothing-repair"].operation).toBe("repair-garment");
    expect(AI_TOOL_UI_CONFIG["shoe-repair"].operation).toBe("repair-footwear");
  });

  it("requires masks and references only where the workflow needs them", () => {
    expect(AI_TOOL_UI_CONFIG.erase.requiresMask).toBe(true);
    expect(AI_TOOL_UI_CONFIG["hand-foot-repair"].requiresMask).toBe(true);
    expect(AI_TOOL_UI_CONFIG["clothing-repair"].requiresReference).toBe(true);
    expect(AI_TOOL_UI_CONFIG["shoe-repair"].requiresReference).toBe(true);
    expect(AI_TOOL_UI_CONFIG.matting.requiresMask).not.toBe(true);
    expect(AI_TOOL_UI_CONFIG.resize.requiresMask).not.toBe(true);
  });

  it("rejects unsupported route slugs", () => {
    expect(isAiToolSlug("matting")).toBe(true);
    expect(isAiToolSlug("api-test")).toBe(false);
  });
});
