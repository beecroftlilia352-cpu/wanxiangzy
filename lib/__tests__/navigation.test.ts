import { describe, expect, it } from "vitest";
import { getActiveTopModule, getFeatureItemsForModule, VISIBLE_TOP_MODULES } from "@/lib/navigation";

describe("top module navigation contract", () => {
  it("matches the reference workspace module order", () => {
    expect(VISIBLE_TOP_MODULES.map((item) => item.key)).toEqual([
      "home",
      "assistant",
      "aiShoots",
      "productImages",
      "aiVideo",
      "tools",
      "toolbox",
      "enterprise",
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

  it("keeps API testing in the AI toolbox and works out of the top bar", () => {
    expect(getActiveTopModule("/api-platform-test")).toBe("toolbox");
    expect(getFeatureItemsForModule("toolbox").map((item) => item.key)).toEqual(["apiTest"]);
    expect(VISIBLE_TOP_MODULES.some((item) => item.key === "works")).toBe(false);
  });
});
