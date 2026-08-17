import { describe, expect, it } from "vitest";
import { AI_TOOL_UI_CONFIG } from "@/features/ai-tools/tool-ui-config";

describe("AI toolbox UI contracts", () => {
  it("uses the original single-image editable selection flow for limb repair", () => {
    const config = AI_TOOL_UI_CONFIG["hand-foot-repair"];

    expect(config.requiresMask).toBe(true);
    expect(config.maxImages).toBe(1);
    expect(config.defaultOutputCount).toBe(1);
    expect(config.modeOptions).toBeUndefined();
    expect(config.defaultMode).toBe("auto");
  });

  it("uses the original two-result defaults for garment and footwear repair", () => {
    expect(AI_TOOL_UI_CONFIG["clothing-repair"].defaultOutputCount).toBe(2);
    expect(AI_TOOL_UI_CONFIG["shoe-repair"].defaultOutputCount).toBe(2);
  });

  it("exposes garment reference roles without adding them to footwear repair", () => {
    expect(AI_TOOL_UI_CONFIG["clothing-repair"].referenceModeOptions).toEqual([
      { value: "flat", label: "平铺图" },
      { value: "model", label: "人台/模特图" },
    ]);
    expect(AI_TOOL_UI_CONFIG["shoe-repair"].referenceModeOptions).toBeUndefined();
  });
});
