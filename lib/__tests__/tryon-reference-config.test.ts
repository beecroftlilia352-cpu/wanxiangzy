import { describe, expect, it } from "vitest";
import {
  TRYON_CLOTHING_CATEGORY_SEED,
  inferTryOnClothingCategories,
  normalizeTryOnClothingAnalysis,
  recommendTryOnReferenceScenes,
  type TryOnReferenceScene,
} from "@/lib/tryon-reference-config";
import { validateTryOnReferenceSceneRows } from "@/lib/tryon-reference-admin";

function scene(overrides: Partial<TryOnReferenceScene>): TryOnReferenceScene {
  return {
    sceneKey: "scene",
    name: "Scene",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/test.jpg",
    status: "active",
    priority: 0,
    sortOrder: 0,
    clothCategories: [],
    gender: "women",
    ageRanges: ["adult"],
    viewTags: ["whole_body"],
    cropTags: ["full_body"],
    sceneTags: [],
    styleTags: [],
    lens: null,
    posture: null,
    promptTags: [],
    rawConfig: {},
    ...overrides,
  };
}

describe("tryon reference config", () => {
  it("seeds the full top-level clothing taxonomy", () => {
    const topLevel = TRYON_CLOTHING_CATEGORY_SEED
      .filter((category) => category.level === 1)
      .map((category) => category.code);

    expect(topLevel).toEqual([
      "outerwear",
      "single_piece_top",
      "bottom_skirt",
      "bottom_pants",
      "dress",
      "underwear",
      "functional_wear",
      "sports_wear",
    ]);
    expect(TRYON_CLOTHING_CATEGORY_SEED.some((category) => category.code === "single_fitted_top")).toBe(true);
    expect(TRYON_CLOTHING_CATEGORY_SEED.some((category) => category.code === "long_pants")).toBe(true);
  });

  it("maps upper garment striped tank tops to single_fitted_top and compatible fitted_top", () => {
    const analysis = normalizeTryOnClothingAnalysis({
      cloth_type: "upper garment",
      desc: "A sleeveless black and white horizontally striped tank top crafted from ribbed knit material with a slim-fitting waist-length cut.",
    });

    expect(analysis.mainCategory).toBe("single_piece_top");
    expect(analysis.subcategories).toContain("single_fitted_top");
    expect(analysis.subcategories).toContain("fitted_top");
    expect(analysis.slot).toBe("upper");
    expect(analysis.fit).toBe("fitted");
  });

  it("scores exact subcategory matches above unrelated scenes", () => {
    const analysis = normalizeTryOnClothingAnalysis({
      mainCategory: "single_piece_top",
      subcategories: ["single_fitted_top"],
      slot: "upper",
    });
    const result = recommendTryOnReferenceScenes({
      analysis,
      scenes: [
        scene({ sceneKey: "pants", clothCategories: ["long_pants"], viewTags: ["lower_body"], cropTags: ["lower_body"] }),
        scene({ sceneKey: "top", clothCategories: ["single_fitted_top"], viewTags: ["upper_body"], cropTags: ["upper_body"] }),
      ],
      garmentAudience: "women",
      ageGroup: "adult",
    });

    expect(result.all[0].sceneKey).toBe("top");
    expect(result.all[0].matchReasons.some((reason) => reason.includes("single_fitted_top"))).toBe(true);
  });

  it("prefers whole/lower body scenes for pants", () => {
    const inferred = inferTryOnClothingCategories({
      clothTypeRaw: "bottom garment",
      desc: "Loose wide leg long pants in denim.",
    });
    const result = recommendTryOnReferenceScenes({
      analysis: normalizeTryOnClothingAnalysis({ ...inferred, mainCategory: "bottom_pants", subcategories: ["long_pants"] }),
      scenes: [
        scene({ sceneKey: "upper-crop", clothCategories: ["single_fitted_top"], viewTags: ["upper_body"], cropTags: ["upper_body"] }),
        scene({ sceneKey: "full-pants", clothCategories: ["long_pants"], viewTags: ["whole_body"], cropTags: ["full_body"] }),
      ],
      garmentAudience: "women",
      ageGroup: "adult",
    });

    expect(result.all[0].sceneKey).toBe("full-pants");
  });

  it("filters intimate scenes for non-adult audiences", () => {
    const result = recommendTryOnReferenceScenes({
      analysis: normalizeTryOnClothingAnalysis({ mainCategory: "underwear", subcategories: ["swimsuit"], slot: "intimate" }),
      scenes: [
        scene({ sceneKey: "intimate", clothCategories: ["swimsuit"], sceneTags: ["intimate"] }),
        scene({ sceneKey: "safe", clothCategories: ["dress"], sceneTags: ["studio"] }),
      ],
      garmentAudience: "women",
      ageGroup: "teen",
    });

    expect(result.safetyBlocked).toBe(true);
    expect(result.all.map((item) => item.sceneKey)).toEqual(["safe"]);
  });

  it("validates managed scenes before publishing", () => {
    const enabledCategoryCodes = new Set(["single_fitted_top"]);
    const result = validateTryOnReferenceSceneRows({
      enabledCategoryCodes,
      requireActiveOnly: true,
      rows: [
        scene({ sceneKey: "valid", clothCategories: ["single_fitted_top"] }),
        scene({ sceneKey: "bad-category", clothCategories: ["missing_category"] }),
        scene({ sceneKey: "bad-host", imageUrl: "https://example.com/a.jpg", clothCategories: ["single_fitted_top"] }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.sceneKey)).toContain("bad-category");
    expect(result.issues.map((issue) => issue.sceneKey)).toContain("bad-host");
  });
});
