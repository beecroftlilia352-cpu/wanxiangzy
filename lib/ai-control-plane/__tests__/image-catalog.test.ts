import { afterEach, describe, expect, it } from "vitest";

import {
  registerImageModelCatalog,
} from "@/lib/image-model-catalog";
import { getCreditCost, getSupportedImageSizes } from "@/lib/api/lingya";

afterEach(() => registerImageModelCatalog([]));

describe("dynamic image model catalog", () => {
  it("drives client price and supported size display from the published catalog", () => {
    registerImageModelCatalog([{
      id: "nano-banana-2",
      displayName: "Nano Banana 2 custom",
      creditPrices: { "2K": 7, "4K": 11 },
      supportedSizes: ["2K", "4K"],
      capabilities: ["generation"],
    }]);

    expect(getSupportedImageSizes("nano-banana-2")).toEqual(["2K", "4K"]);
    expect(getCreditCost("nano-banana-2", "4K")).toBe(11);
  });
});
