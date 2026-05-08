import { describe, expect, it } from "vitest";
import {
  PRODUCT_SET_PROMPT_VERSION,
  buildProductSetPrompt,
  getProductSetModuleKey,
  getProductSetModuleReason,
  normalizeProductSetProductProfile,
  resolveProductSetTemplates,
  shouldUseModelForTemplate,
  type ProductSetProductProfile,
  type ProductSetSettings,
} from "../product-set";

const BASE_SETTINGS: ProductSetSettings = {
  country: "China",
  language: "Chinese",
  platform: "Taobao",
  themeMode: "auto",
  themeColor: "auto",
  fontStyle: "auto",
  stylePackId: "auto",
  extraDescription: "",
  visualDirectorScript: "",
};

function menswearProfile(): ProductSetProductProfile {
  return normalizeProductSetProductProfile({
    kind: "apparel",
    apparelType: "menswear",
    displayName: "menswear jacket",
    confidence: 0.92,
    isApparel: true,
    needsModel: true,
    modelStrategy: "recommended",
    modelBrief: "Use an adult male model; keep the styling masculine, practical, and matched to the uploaded jacket.",
    recommendedMainPlanId: "ai-main",
    recommendedDetailsPlanId: "ai-details",
    planningNotes: ["AI vision identified a menswear product; do not use womenswear presets."],
    visualKeywords: ["menswear", "jacket", "structured fabric"],
  });
}

describe("product set smart planning", () => {
  it("uses AI visual director modules for smart menswear details instead of local presets", () => {
    const profile = menswearProfile();
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 5,
      productProfile: profile,
      settings: {
        ...BASE_SETTINGS,
        visualDirectorPlan: {
          strategyName: "Menswear utility detail page",
          styleStrategy: "Structured, practical, male model usage proof.",
          globalStrategy: {
            corePalette: "charcoal, steel grey, white",
            primaryColor: "charcoal",
            secondaryColors: ["steel grey", "white"],
            accentColor: "signal blue",
            colorTemperature: "cool neutral",
            lighting: "clean studio daylight",
            typography: "bold sans serif",
            textureMood: "structured fabric closeups",
          },
          mainPlan: [],
          detailsPlan: [
            { moduleKey: "hero", purpose: "menswear first screen", layout: "large jacket hero", copyRule: "short title" },
            { moduleKey: "wearing_proof", purpose: "adult male wearing proof", layout: "male model three-quarter body", copyRule: "minimal fit note" },
            { moduleKey: "material_fit_detail", purpose: "fabric and construction detail", layout: "macro panels", copyRule: "large factual labels" },
          ],
          mainScripts: [],
          detailsScripts: [
            { screenNo: 1, moduleKey: "hero", title: "Urban jacket hero", globalTone: "masculine", sceneDesign: "studio product hero", visualComposition: "large jacket with strong whitespace", copyContent: "short headline", layoutRules: "no model yet", constraints: "no womenswear styling" },
            { screenNo: 2, moduleKey: "wearing_proof", title: "Male model fit", globalTone: "practical", sceneDesign: "adult male model wearing the jacket", visualComposition: "three-quarter body fit proof", copyContent: "minimal fit copy", layoutRules: "catalog proof", constraints: "do not use female model" },
            { screenNo: 3, moduleKey: "material_fit_detail", title: "Fabric proof", globalTone: "technical", sceneDesign: "macro fabric detail", visualComposition: "close-up panels", copyContent: "four factual labels", layoutRules: "detail evidence", constraints: "no fake specs" },
          ],
          layoutPrinciples: ["product-led", "clear hierarchy"],
          copyStrategy: "short readable ecommerce copy",
          negativeLayouts: ["womenswear preset poses", "dense tiny tables"],
        },
      },
    });

    expect(templates).toHaveLength(5);
    expect(templates.every((template) => template.source === "ai")).toBe(true);
    expect(templates.map((template) => template.id)).toEqual([
      "ai-details-1-hero",
      "ai-details-2-wearing_proof",
      "ai-details-3-material_fit_detail",
      "ai-details-4-size_fit_guide",
      "ai-details-5-lifestyle_story",
    ]);
    expect(templates.some((template) => String(template.id).includes("women"))).toBe(false);
    expect(shouldUseModelForTemplate(templates[1], profile)).toBe(true);
    expect(templates[1].avoidRules).toContain("female model");
  });

  it("falls back to generated AI modules, not preset ids, when no visual director plan exists", () => {
    const profile = menswearProfile();
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 4,
      productProfile: profile,
    });

    expect(templates.map((item) => item.source)).toEqual(["ai", "ai", "ai", "ai"]);
    expect(templates.map((item) => item.id)).toEqual([
      "ai-details-1-hero",
      "ai-details-2-wearing_proof",
      "ai-details-3-material_fit_detail",
      "ai-details-4-size_fit_guide",
    ]);
  });

  it("keeps generic product details focused on non-model AI ecommerce modules", () => {
    const profile = normalizeProductSetProductProfile({
      kind: "electronics",
      apparelType: "general",
      displayName: "desk fan",
      confidence: 0.9,
      isApparel: false,
      needsModel: false,
      modelStrategy: "none",
      modelBrief: "No model needed.",
    });
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 6,
      productProfile: profile,
    });

    expect(templates.every((template) => template.source === "ai")).toBe(true);
    expect(templates.some((template) => shouldUseModelForTemplate(template, profile))).toBe(false);
    expect(templates[0].coverImage).toBeUndefined();
  });

  it("applies module overrides and keeps prompt version/style pack traceable", () => {
    const profile = menswearProfile();
    const base = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 4,
      productProfile: profile,
    });
    const firstKey = getProductSetModuleKey(base[0], 0);
    const secondKey = getProductSetModuleKey(base[1], 1);
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 4,
      productProfile: profile,
      moduleOverrides: [
        { key: firstKey, disabled: true },
        { key: secondKey, name: "Edited male model scene", copyDensity: "light" },
      ],
    });

    expect(templates.map((item) => item.id)).not.toContain(base[0].id);
    expect(templates[0].name).toBe("Edited male model scene");
    expect(getProductSetModuleReason(templates[0], profile)).toBeTruthy();

    const prompt = buildProductSetPrompt({
      productInfo: "Product name: menswear jacket",
      productProfile: profile,
      productImageCount: 3,
      template: templates[0],
      allTemplates: templates,
      settings: {
        ...BASE_SETTINGS,
        platform: "Xiaohongshu",
        stylePackId: "minimal_indie",
        visualDirectorScript: "Use adult male styling only; avoid womenswear preset poses.",
      },
      mode: "smart",
      aspectRatio: templates[0].aspectRatio,
      imageSize: "1K",
      sequenceIndex: 0,
      totalCount: templates.length,
    });

    expect(prompt).toContain(PRODUCT_SET_PROMPT_VERSION);
    expect(prompt).toContain("minimal independent");
    expect(prompt).toContain("AI visual analysis module");
    expect(prompt).toContain("adult male styling");
    expect(prompt).toContain("Copy density for this module: light");
  });
});
