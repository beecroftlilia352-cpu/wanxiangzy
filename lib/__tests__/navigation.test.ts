import { describe, expect, it } from "vitest";
import { getActiveTopModule, getFeatureItemsForModule, VISIBLE_TOP_MODULES } from "@/lib/navigation";

describe("top module navigation contract", () => {
  it("keeps 素材生成 (tools) visible in the header nav", () => {
    expect(VISIBLE_TOP_MODULES.map((item) => item.key)).toEqual([
      "aiShoots",
      "productImages",
      "tools",
      "aiVideo",
      "works",
    ]);
  });

  it("resolves general-image routes to the tools module", () => {
    expect(getActiveTopModule("/general-image")).toBe("tools");
    expect(getActiveTopModule("/general-image/image-to-image")).toBe("tools");
  });

  it("shows 文生图 before 图生图 in the tools feature rail", () => {
    const keys = getFeatureItemsForModule("tools").map((item) => item.key);
    expect(keys).toEqual(expect.arrayContaining(["textToImage", "imageToImage"]));
    expect(keys.indexOf("textToImage")).toBeLessThan(keys.indexOf("imageToImage"));
  });
});
