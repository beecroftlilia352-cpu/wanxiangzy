import { afterEach, describe, expect, it } from "vitest";

import {
  registerImageModelCatalog,
} from "@/lib/image-model-catalog";
import { getCreditCost, getSupportedImageSizes } from "@/lib/api/lingya";

afterEach(() => registerImageModelCatalog([]));

describe("dynamic image model catalog", () => {
  it("drives client price and supported size display from the published catalog", () => {
    registerImageModelCatalog([{
      id: "qwen-image-3",
      displayName: "Qwen Image 3",
      creditPrices: { "2K": 7, "4K": 11 },
      supportedSizes: ["2K", "4K"],
      capabilities: ["generation"],
    }]);

    expect(getSupportedImageSizes("qwen-image-3")).toEqual(["2K", "4K"]);
    expect(getCreditCost("qwen-image-3", "4K")).toBe(11);
  });
});
