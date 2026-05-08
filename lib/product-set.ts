import type { AspectRatio } from "@/lib/api/lingya";

export const PRODUCT_SET_PROMPT_VERSION = "product-set-v5";

export type ProductSetImageType = "main" | "details";
export type ProductSetCreationMode = "smart" | "custom";
export type ProductSetThemeMode = "auto" | "custom";
export type ProductSetFontStyle = "auto" | "minimal" | "elegant" | "bold" | "handwritten" | "custom";
export type ProductSetScenario = "general" | "womenswear";
export type ProductSetProductKind = "apparel" | "footwear" | "bag" | "accessory" | "beauty" | "electronics" | "home" | "toy" | "food" | "general";
export type ProductSetApparelType = "womenswear" | "menswear" | "kidswear" | "intimate" | "swimwear" | "sportswear" | "outerwear" | "general";
export type ProductSetModelStrategy = "none" | "optional" | "recommended" | "required";
export type ProductSetCopyDensity = "none" | "light" | "standard" | "rich";
export type ProductSetStylePackId = "auto" | "french_commute" | "korean_sweet" | "outdoor_utility" | "xiaohongshu_girl" | "minimal_indie" | "shein_fastfashion";

export type ProductSetVisualDirectorModule = {
  moduleKey: string;
  purpose: string;
  layout: string;
  copyRule: string;
};

export type ProductSetGlobalVisualStrategy = {
  corePalette: string;
  primaryColor: string;
  secondaryColors: string[];
  accentColor: string;
  colorTemperature: string;
  lighting: string;
  typography: string;
  textureMood: string;
};

export type ProductSetVisualDirectorScreenScript = {
  screenNo?: number;
  moduleKey: string;
  title: string;
  globalTone: string;
  sceneDesign: string;
  visualComposition: string;
  copyContent: string;
  layoutRules: string;
  constraints: string;
};

export type ProductSetVisualDirectorPlan = {
  strategyName: string;
  styleStrategy: string;
  globalStrategy: ProductSetGlobalVisualStrategy;
  mainPlan: ProductSetVisualDirectorModule[];
  detailsPlan: ProductSetVisualDirectorModule[];
  mainScripts: ProductSetVisualDirectorScreenScript[];
  detailsScripts: ProductSetVisualDirectorScreenScript[];
  layoutPrinciples: string[];
  copyStrategy: string;
  negativeLayouts: string[];
};

export type ProductSetStylePack = {
  id: ProductSetStylePackId;
  name: string;
  description: string;
  keywords: string[];
  extraPrompt: string;
  recommendedSettings?: Partial<ProductSetSettings>;
};

export type ProductSetModuleOverride = {
  key: string;
  name?: string;
  moduleRole?: string;
  contentScope?: string;
  layoutRules?: string;
  textRules?: string;
  avoidRules?: string;
  typeDescription?: string;
  extraDescription?: string;
  aspectRatio?: AspectRatio;
  subjectConsistency?: boolean;
  modelConsistency?: boolean;
  intelligentCopy?: boolean;
  copyDensity?: ProductSetCopyDensity;
  disabled?: boolean;
};

export type ProductSetModuleStatus = "queued" | "running" | "completed" | "failed";

export type ProductSetModuleResult = {
  moduleKey: string;
  index: number;
  templateId: string;
  templateSource: ProductSetResolvedTemplate["source"];
  name: string;
  imageType: ProductSetImageType;
  aspectRatio: AspectRatio;
  moduleRole?: string;
  contentScope?: string;
  status: ProductSetModuleStatus;
  progress: number;
  resultUrl?: string;
  error?: string;
  taskId?: string;
  providerStatus?: string;
  attempt?: number;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  durationMs?: number;
  promptVersion?: string;
  promptVariant?: string;
  promptHash?: string;
  qualityScore?: number;
  qualityIssues?: string[];
  qualitySummary?: string;
  qualitySource?: string;
};

export type ProductSetProductProfile = {
  kind: ProductSetProductKind;
  apparelType: ProductSetApparelType;
  displayName: string;
  confidence: number;
  isApparel: boolean;
  needsModel: boolean;
  modelStrategy: ProductSetModelStrategy;
  modelBrief: string;
  recommendedMainPlanId: string;
  recommendedDetailsPlanId: string;
  planningNotes: string[];
  visualKeywords: string[];
};

export type ProductSetTemplate = {
  id: number;
  name: string;
  imageType: ProductSetImageType;
  coverImage: string;
  aspectRatio: AspectRatio;
  moduleRole: string;
  contentScope: string;
  layoutRules: string;
  textRules: string;
  avoidRules: string;
  typeDescription: string;
  typeDescriptionV2: string;
  batchSize: number;
  subjectConsistency: boolean;
  modelConsistency?: boolean;
  intelligentCopy: boolean;
  copyDensity?: ProductSetCopyDensity;
  innerExtraDescription: string;
  scenario?: ProductSetScenario;
};

export type ProductSetCustomTemplate = {
  id: string;
  name: string;
  imageType: ProductSetImageType;
  typeDescription: string;
  aspectRatio: AspectRatio;
  referenceImageUrls?: string[];
  modelReferenceImageUrls?: string[];
  otherReferenceImageUrls?: string[];
  extraDescription?: string;
  subjectConsistency?: boolean;
  modelConsistency?: boolean;
  intelligentCopy?: boolean;
  copyDensity?: ProductSetCopyDensity;
  moduleRole?: string;
  contentScope?: string;
  layoutRules?: string;
  textRules?: string;
  avoidRules?: string;
};

export type ProductSetResolvedTemplate =
  | ({ source: "preset" } & ProductSetTemplate)
  | ({ source: "ai" } & {
      id: string;
      name: string;
      imageType: ProductSetImageType;
      aspectRatio: AspectRatio;
      moduleRole: string;
      contentScope: string;
      layoutRules: string;
      textRules: string;
      avoidRules: string;
      typeDescription: string;
      typeDescriptionV2: string;
      batchSize: number;
      subjectConsistency: boolean;
      modelConsistency?: boolean;
      intelligentCopy: boolean;
      copyDensity?: ProductSetCopyDensity;
      innerExtraDescription: string;
      coverImage?: string;
      scenario?: ProductSetScenario;
    })
  | ({ source: "custom" } & ProductSetCustomTemplate & {
      typeDescriptionV2: string;
      batchSize: number;
      subjectConsistency: boolean;
      modelConsistency?: boolean;
      intelligentCopy: boolean;
      copyDensity?: ProductSetCopyDensity;
      innerExtraDescription: string;
      moduleRole: string;
      contentScope: string;
      layoutRules: string;
      textRules: string;
      avoidRules: string;
      coverImage?: string;
      scenario?: ProductSetScenario;
    });

export type ProductSetSettings = {
  country: string;
  language: string;
  platform: string;
  themeMode: ProductSetThemeMode;
  themeColor: string;
  fontStyle: ProductSetFontStyle;
  stylePackId?: ProductSetStylePackId;
  extraDescription?: string;
  visualDirectorScript?: string;
  visualDirectorPlan?: ProductSetVisualDirectorPlan;
};

export type ProductSetPresetPlan = {
  id: string;
  name: string;
  description: string;
  imageType: ProductSetImageType;
  templateIds: number[];
  platformHint: string;
  scenario?: "general" | "womenswear";
};

export type ProductSetPlanRecommendation = {
  title: string;
  summary: string;
  primaryPlanId: string;
  suggestedCount: number;
  modelAdvice: string;
  riskLevel: "low" | "medium" | "high";
  modules: Array<{
    key: string;
    name: string;
    role: string;
    reason: string;
    aspectRatio: AspectRatio;
    usesModel: boolean;
  }>;
};

export const PRODUCT_SET_EXAMPLE_GROUPS = [
  {
    id: "jacket",
    name: "冲锋夹克三视角",
    images: [
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/image/dictionary/product_set_examples/2/1.jpg",
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/image/dictionary/product_set_examples/2/2.jpg",
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/image/dictionary/product_set_examples/2/3.jpg",
    ],
  },
  {
    id: "toy",
    name: "玩具多视角",
    images: [
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/image/dictionary/product_set_examples/1/1.png",
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/image/dictionary/product_set_examples/1/2.jpg",
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/image/dictionary/product_set_examples/1/3.jpg",
    ],
  },
] as const;

export const PRODUCT_SET_COUNTRIES = [
  "中国",
  "美国",
  "英国",
  "德国",
  "日本",
  "巴西",
  "沙特",
  "越南",
  "墨西哥",
  "印度",
  "波兰",
  "韩国",
  "自定义",
];

export const PRODUCT_SET_LANGUAGES = [
  "中文",
  "英语",
  "德语",
  "西班牙语",
  "日语",
  "法语",
  "葡萄牙语",
  "阿拉伯语",
  "韩语",
  "自定义",
];

export const PRODUCT_SET_PLATFORMS = [
  "淘宝",
  "亚马逊",
  "拼多多",
  "抖音",
  "小红书",
  "京东",
  "Temu",
  "Shopee",
  "Shein",
  "速卖通",
  "Shopify",
  "eBay",
  "Lazada",
  "Etsy",
];

export const PRODUCT_SET_FONT_STYLE_LABELS: Record<ProductSetFontStyle, string> = {
  auto: "智能字体风格",
  minimal: "极简无衬线体",
  elegant: "优雅衬线体",
  bold: "力量粗体/营销体",
  handwritten: "手写/书法体",
  custom: "自定义",
};

export const PRODUCT_SET_STYLE_PACKS: ProductSetStylePack[] = [
  {
    id: "auto",
    name: "智能匹配",
    description: "按商品识别结果、目标平台和模板用途自动决定视觉调性。",
    keywords: ["auto", "balanced", "platform-ready"],
    extraPrompt: "Visual style pack: auto. Choose a commercially appropriate style from product category, platform, country, and module role. Keep the full set visually coherent but do not repeat the same layout.",
  },
  {
    id: "french_commute",
    name: "法式通勤",
    description: "适合女装、包鞋、饰品，强调松弛高级、自然光和城市通勤感。",
    keywords: ["french commute", "soft daylight", "quiet luxury", "city outfit"],
    extraPrompt: "Visual style pack: French commute. Use soft daylight, calm city/lifestyle setting, refined neutral palette, restrained typography, relaxed premium styling. Avoid loud sale graphics.",
    recommendedSettings: { platform: "小红书", fontStyle: "elegant" },
  },
  {
    id: "korean_sweet",
    name: "韩系甜美",
    description: "适合女装上新、少女感单品、柔和色系，画面更明亮轻盈。",
    keywords: ["korean sweet", "pastel", "soft cute", "bright outfit"],
    extraPrompt: "Visual style pack: Korean sweet. Use bright soft lighting, pastel accents, airy composition, gentle model expression, cute but not childish styling. Keep garment details accurate.",
    recommendedSettings: { platform: "小红书", fontStyle: "minimal" },
  },
  {
    id: "outdoor_utility",
    name: "户外机能",
    description: "适合冲锋衣、运动、工具类、功能型商品，突出耐用、安全、场景感。",
    keywords: ["outdoor utility", "functional", "rugged", "weatherproof"],
    extraPrompt: "Visual style pack: outdoor utility. Use functional outdoor/commercial scene, crisp contrast, material toughness, safety/function cues, practical typography. Do not make it fantasy or overdramatic.",
    recommendedSettings: { fontStyle: "bold" },
  },
  {
    id: "xiaohongshu_girl",
    name: "小红书种草",
    description: "适合穿搭、生活方式、轻内容种草，强调收藏感和真实分享感。",
    keywords: ["xiaohongshu", "lifestyle", "shareable", "soft editorial"],
    extraPrompt: "Visual style pack: Xiaohongshu seeding. Make it social-commerce friendly with natural lifestyle framing, short readable captions, authentic outfit/detail moments, and save-worthy layout. Avoid exaggerated claims.",
    recommendedSettings: { platform: "小红书", fontStyle: "handwritten" },
  },
  {
    id: "minimal_indie",
    name: "极简独立站",
    description: "适合 Shopify、独立站、品牌型详情页，留白更足、质感更克制。",
    keywords: ["minimal", "shopify", "brand", "editorial"],
    extraPrompt: "Visual style pack: minimal independent brand. Use generous whitespace, restrained grid, premium product photography, precise type hierarchy, low copy density, and brand-like consistency.",
    recommendedSettings: { platform: "Shopify", fontStyle: "minimal" },
  },
  {
    id: "shein_fastfashion",
    name: "快时尚上新",
    description: "适合服装批量上新，直接、清爽、突出款式和搭配转化。",
    keywords: ["fast fashion", "new arrival", "clean model", "conversion"],
    extraPrompt: "Visual style pack: fast fashion launch. Prioritize clear garment fit, multiple outfit angles, conversion-oriented but clean copy, quick-scan layout, and consistent model/catalog feel.",
    recommendedSettings: { platform: "Shein", fontStyle: "minimal" },
  },
];

function template(
  id: number,
  name: string,
  imageType: ProductSetImageType,
  coverImage: string,
  aspectRatio: AspectRatio,
  typeDescription: string,
  innerExtraDescription: string,
  options: {
    subjectConsistency?: boolean;
    modelConsistency?: boolean;
    intelligentCopy?: boolean;
    copyDensity?: ProductSetCopyDensity;
    typeDescriptionV2?: string;
    scenario?: ProductSetScenario;
    guidance?: Partial<ProductSetModuleGuidance>;
  } = {}
): ProductSetTemplate {
  const scenario = options.scenario || "general";
  const guidance = {
    ...inferTemplateGuidance(id, name, imageType, scenario),
    ...(options.guidance || {}),
  };
  return {
    id,
    name,
    imageType,
    coverImage,
    aspectRatio,
    ...guidance,
    batchSize: 1,
    subjectConsistency: Boolean(options.subjectConsistency),
    modelConsistency: Boolean(options.modelConsistency),
    intelligentCopy: Boolean(options.intelligentCopy),
    copyDensity: options.copyDensity || (options.intelligentCopy ? "standard" : "light"),
    typeDescription,
    typeDescriptionV2: options.typeDescriptionV2 || typeDescription,
    innerExtraDescription,
    scenario,
  };
}

const STYLE_BASE = "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.6/product_set_style";

type ProductSetModuleGuidance = {
  moduleRole: string;
  contentScope: string;
  layoutRules: string;
  textRules: string;
  avoidRules: string;
};

function inferTemplateGuidance(
  id: number,
  name: string,
  imageType: ProductSetImageType,
  scenario: ProductSetScenario
): ProductSetModuleGuidance {
  const baseAvoid = "Do not reuse the same headline, same bullet stack, same icon list, same bottom thumbnail strip, or same layout used by other modules in this product set.";
  const generic: ProductSetModuleGuidance = {
    moduleRole: imageType === "main" ? "商品主图/辅图模块" : "详情页内容模块",
    contentScope: "Focus on the template-specific purpose only; select only product facts that support this module.",
    layoutRules: "Use a distinct composition suitable for this module; keep product identity accurate and the layout commercially finished.",
    textRules: "Use concise readable copy only when it helps the module. Do not paste the full product information into the image.",
    avoidRules: baseAvoid,
  };

  const byId: Record<number, ProductSetModuleGuidance> = {
    1: {
      moduleRole: "标准白底首图，负责展示商品完整外观",
      contentScope: "Only show the clean full product appearance, silhouette, color, material impression and shadow volume.",
      layoutRules: "Single product hero on pure white or very light background; centered or 3/4 angle; commercial retouching; generous whitespace.",
      textRules: "No feature bullet list. At most one tiny neutral label if necessary; the product image is the content.",
      avoidRules: `${baseAvoid} Do not add model, lifestyle scene, detail thumbnails, size tables, or marketing badges.`,
    },
    2: {
      moduleRole: "白底细节特写，负责呈现局部工艺",
      contentScope: "Only focus on close-up details such as fabric texture, stitching, zipper, buttons, collar, sleeve cuff, logo craft or seams.",
      layoutRules: "Use macro close-ups or a clean 3-5 panel grid. The full product may appear small only as context.",
      textRules: "Use short factual labels for each close-up. No general headline and no full selling-point list.",
      avoidRules: `${baseAvoid} Do not create a lifestyle hero image or repeat the main selling-point module.`,
    },
    5: {
      moduleRole: "多角度展示，负责正侧背结构对照",
      contentScope: "Show multiple product views: front, side, back, detail angle, folded or top view when relevant.",
      layoutRules: "Use a white-background multi-view grid with consistent scale, lighting and alignment.",
      textRules: "Minimal view labels only, such as front/back/side/detail. No marketing copy.",
      avoidRules: `${baseAvoid} Do not use a model scene or feature analysis layout.`,
    },
    6: {
      moduleRole: "模特上身展示，负责真实穿着效果",
      contentScope: "Show fit, drape, length, silhouette and natural wearing state on a model.",
      layoutRules: "One primary model wearing the product, natural posture, ecommerce-ready lighting, little or no collage.",
      textRules: "At most one short style caption. Do not use detail labels or a bullet list.",
      avoidRules: `${baseAvoid} Do not turn this into a fabric-detail sheet or size chart.`,
    },
    8: {
      moduleRole: "单场景氛围图，负责使用场景与情绪",
      contentScope: "Show the product in one relevant scene and communicate mood, lifestyle, usage context and visual desirability.",
      layoutRules: "One coherent scene with product as hero. Props should support the use case and not steal attention.",
      textRules: "One headline plus one short supporting line maximum.",
      avoidRules: `${baseAvoid} Do not include many technical bullets, size tables or detail close-up grids.`,
    },
    12: {
      moduleRole: "主图核心卖点解析，负责3-4个购买理由",
      contentScope: "This is the only main-image module allowed to summarize several high-confidence purchase reasons.",
      layoutRules: "Product hero plus 3-4 callouts with icons or leader lines. Keep hierarchy clear and premium.",
      textRules: "Use 3-4 concise selling points only. Do not invent certifications, prices, medical claims or exact dimensions.",
      avoidRules: `${baseAvoid} Do not copy every bullet from product info; prioritize the strongest differentiators.`,
    },
    25: {
      moduleRole: "节日/活动氛围图，负责时间节点转化",
      contentScope: "Show one seasonal or holiday purchase context with matching decorations and urgency mood.",
      layoutRules: "Festive scene or campaign poster, product remains clearly recognizable.",
      textRules: "Short seasonal headline and optional offer-style phrase, without prices unless provided.",
      avoidRules: `${baseAvoid} Do not use generic detail or size content.`,
    },
    101: {
      moduleRole: "女装白底精修主图，负责版型和颜色真实呈现",
      contentScope: "Only show garment silhouette, color, neckline, sleeve, hem, waistline, length and fabric drape.",
      layoutRules: "Clean white e-commerce image, full garment, natural shadow, no lifestyle scene.",
      textRules: "No bullet list. No model unless the source garment requires wearing state.",
      avoidRules: `${baseAvoid} Do not add styling suggestions, model street scene, or feature-analysis panels.`,
    },
    102: {
      moduleRole: "女装通勤场景图，负责日常穿搭适配",
      contentScope: "Show wearable commuting or casual outfit styling, fit, drape and everyday occasion.",
      layoutRules: "One natural model scene: office, street, cafe or commute. Include simple compatible styling items.",
      textRules: "One lifestyle headline plus 2-3 short style tags maximum.",
      avoidRules: `${baseAvoid} Do not include fabric macro grid, size chart, or full selling-point list.`,
    },
    103: {
      moduleRole: "女装街拍 Lookbook，负责社交内容感",
      contentScope: "Show outfit mood, movement, season, styling attitude and social-media save-worthy composition.",
      layoutRules: "Editorial street/cafe/window-light photo style; natural pose, not a product-spec diagram.",
      textRules: "Use natural short notes or style keywords. Avoid dense ecommerce copy.",
      avoidRules: `${baseAvoid} Do not duplicate the commuting scene or detail sheet.`,
    },
    104: {
      moduleRole: "女装搭配建议图，负责鞋包内搭组合建议",
      contentScope: "Show what to pair with the garment: inner layer, bottoms, shoes, bag or accessories.",
      layoutRules: "Outfit board, flat lay or clean matching matrix. Product remains central.",
      textRules: "Short pairing labels only. Do not list fabric/spec selling points.",
      avoidRules: `${baseAvoid} Do not become a model hero image or size chart.`,
    },
    3: {
      moduleRole: "详情页白底细节模块，负责材质与做工可信度",
      contentScope: "Only close-up details that prove quality: texture, seam, hardware, collar, sleeve, interface or craftsmanship.",
      layoutRules: "Detail collage with one clear hierarchy: one larger close-up plus 3-4 secondary close-ups.",
      textRules: "Short factual labels under each close-up. No full product selling stack.",
      avoidRules: `${baseAvoid} Do not create a lifestyle hero or general selling-point poster.`,
    },
    4: {
      moduleRole: "详情页非白底细节模块，负责真实环境下的局部质感",
      contentScope: "Close-up details in a styled surface or real context. Emphasize tactile quality.",
      layoutRules: "Macro photography with warm/clean prop environment; product details are the focus.",
      textRules: "Short labels for texture and craftsmanship only.",
      avoidRules: `${baseAvoid} Do not include size table or multiple unrelated scenes.`,
    },
    7: {
      moduleRole: "详情页上身模块，负责穿着效果证明",
      contentScope: "Show human wearing fit, proportions, comfort impression and movement.",
      layoutRules: "Model wearing scene, full or half body, natural expression and posture.",
      textRules: "Very light caption only.",
      avoidRules: `${baseAvoid} Do not duplicate material-detail or size-advice modules.`,
    },
    9: {
      moduleRole: "详情页单场景展示，负责一个明确使用场景",
      contentScope: "Show the product being used or displayed in one coherent environment.",
      layoutRules: "One scene, one purpose, clean commercial photography.",
      textRules: "One concise headline and one support line maximum.",
      avoidRules: `${baseAvoid} Do not include multi-scene grid or specification chart.`,
    },
    10: {
      moduleRole: "详情页多场景模块，负责场景覆盖面",
      contentScope: "Show 3-4 different usage contexts, each with a different benefit or lifestyle angle.",
      layoutRules: "Split grid or panels, each panel has a distinct scene.",
      textRules: "Short scene labels only. No repeated identical feature bullets.",
      avoidRules: `${baseAvoid} Do not make all panels the same scene or same copy.`,
    },
    11: {
      moduleRole: "尺寸/尺码模块，负责降低尺寸误解",
      contentScope: "Show measurements, fit guidance, comparison scale or size selection logic.",
      layoutRules: "Diagram/table/measurement guide. Use clean lines and readable numbers only if provided.",
      textRules: "If exact data is not provided, use measurement positions and neutral fit advice instead of fake values.",
      avoidRules: `${baseAvoid} Do not invent exact dimensions, weights or size tables.`,
    },
    13: {
      moduleRole: "详情页核心卖点模块，负责购买理由总结",
      contentScope: "This module may summarize 3-5 high-confidence benefits, each mapped to visible product facts.",
      layoutRules: "Clear product hero with callouts. Use visual hierarchy, not a dense wall of text.",
      textRules: "Use concise selling-point copy; do not repeat detail labels from material/size modules.",
      avoidRules: `${baseAvoid} Do not include unsupported claims, fake awards, medical claims or exact data.`,
    },
    14: {
      moduleRole: "详情页首屏海报，负责第一眼情绪和定位",
      contentScope: "Communicate product category, target mood and one key value proposition only.",
      layoutRules: "Large hero composition, strong whitespace, refined brand-like visual. No dense detail collage.",
      textRules: "One headline, one subheadline, optional 1-2 tiny tags. No feature bullet stack.",
      avoidRules: `${baseAvoid} Do not show size charts, detail macro grid, or all product selling points.`,
    },
    15: {
      moduleRole: "包装展示模块，负责交付感和礼盒感",
      contentScope: "Show packaging, unboxing, set contents or gift-ready presentation.",
      layoutRules: "Product plus packaging in a clean arrangement; packaging structure visible.",
      textRules: "Short labels for contents or packaging highlights only.",
      avoidRules: `${baseAvoid} Do not make a general lifestyle poster.`,
    },
    17: {
      moduleRole: "结构示意模块，负责构造理解",
      contentScope: "Show layers, components, assembly relationships or mechanism only.",
      layoutRules: "Technical diagram, exploded view or labeled structure graphic.",
      textRules: "Use accurate labels for visible or user-provided structures only.",
      avoidRules: `${baseAvoid} Do not invent internal technology not supported by product info.`,
    },
    18: {
      moduleRole: "痛点对比模块，负责 Before/After 转化",
      contentScope: "Show one user pain point and how the product helps, without exaggeration.",
      layoutRules: "Before/after split or contrast scene with clear visual difference.",
      textRules: "One pain label and one solution label; keep claims reasonable.",
      avoidRules: `${baseAvoid} Do not make this a generic selling-point module.`,
    },
    19: {
      moduleRole: "运输安装模块，负责步骤说明",
      contentScope: "Show shipping, unpacking, installation, assembly steps or precautions.",
      layoutRules: "Numbered step diagram or clean instruction panels.",
      textRules: "Short step labels only; no marketing copy.",
      avoidRules: `${baseAvoid} Do not invent tools or steps not implied by the product.`,
    },
    21: {
      moduleRole: "买家秀实拍模块，负责真实感和社交证明",
      contentScope: "Show natural consumer-like usage, casual environment, authentic photography feeling.",
      layoutRules: "Less polished than hero posters; natural light, candid angle, real-life context.",
      textRules: "0-2 casual captions. Avoid polished sales copy.",
      avoidRules: `${baseAvoid} Do not create a spec sheet, size chart or dense feature poster.`,
    },
    22: {
      moduleRole: "材质说明模块，负责用料和触感",
      contentScope: "Only material, texture, composition impression, surface, weave, gloss, softness or sturdiness.",
      layoutRules: "Macro material panel plus product context, clean scientific or premium tone.",
      textRules: "Short material labels. Do not include unrelated selling points.",
      avoidRules: `${baseAvoid} Do not invent exact composition percentages unless provided.`,
    },
    23: {
      moduleRole: "核心成分模块，负责原料/成分信任",
      contentScope: "Only ingredients, raw materials, formula context or source story if product category supports it.",
      layoutRules: "Ingredient orbit, material flat lay or clean formula visual.",
      textRules: "Use ingredient names only when provided or visually obvious.",
      avoidRules: `${baseAvoid} Do not invent efficacy claims or medical statements.`,
    },
    24: {
      moduleRole: "科技拆解模块，负责技术感和内部结构",
      contentScope: "Only technical structure, module separation, functional layers or mechanism.",
      layoutRules: "3D/exploded technical rendering with readable callouts.",
      textRules: "Short tech labels. Use only visible or provided facts.",
      avoidRules: `${baseAvoid} Do not invent unsupported patents or technology names.`,
    },
    26: {
      moduleRole: "品牌/权威背书模块，负责信任证明",
      contentScope: "Show certifications, awards, reports, brand history or authority context only if provided.",
      layoutRules: "Professional, restrained layout like a trust panel.",
      textRules: "If proof is not provided, use generic quality-control wording without fake institution names.",
      avoidRules: `${baseAvoid} Do not fabricate certificates, awards, FDA/CE, patents or logos.`,
    },
    27: {
      moduleRole: "使用步骤模块，负责教程和上手",
      contentScope: "Show how to use, wear, install, clean or operate the product step by step.",
      layoutRules: "Numbered panels, hand/action close-ups, simple arrows.",
      textRules: "Short step labels only.",
      avoidRules: `${baseAvoid} Do not add broad selling-point copy.`,
    },
    105: {
      moduleRole: "女装面料/版型细节模块，负责细节品质",
      contentScope: "Only fabric texture, collar/hood, buttons, cuffs, pocket, hem, stitching, lining, drape and shape.",
      layoutRules: "Detail sheet: one clean garment context plus macro panels. Keep it different from the hero poster.",
      textRules: "3-5 detail labels. Do not use a big lifestyle headline.",
      avoidRules: `${baseAvoid} Do not repeat the same selling-point list from the core-selling module.`,
    },
    106: {
      moduleRole: "女装尺码/试穿建议模块，负责版型和选码",
      contentScope: "Only fit type, looseness, length, shoulder/waist/hem measurement positions and body-type suggestions.",
      layoutRules: "Measurement diagram, front/back garment view and fit advice blocks.",
      textRules: "Do not invent exact size numbers. Use neutral fit advice and measurement position labels when data is missing.",
      avoidRules: `${baseAvoid} Do not include fabric detail grid or lifestyle scene as the main content.`,
    },
    107: {
      moduleRole: "女装小红书种草模块，负责穿搭氛围和收藏感",
      contentScope: "Only outfit mood, season, styling tags, commute/date/casual scenes and social content feel.",
      layoutRules: "Editorial social-commerce composition with natural model/flat-lay; airy and save-worthy.",
      textRules: "Natural short phrases, 2-4 style tags maximum. Avoid hard-sell marketing.",
      avoidRules: `${baseAvoid} Do not turn this into a size chart, fabric sheet or full feature poster.`,
    },
  };

  if (byId[id]) return byId[id];
  if (scenario === "womenswear") {
    return {
      ...generic,
      moduleRole: `${name}，负责女装套图中的独立模块`,
      contentScope: "Preserve garment silhouette, fabric, color and styling context while focusing only on this module's purpose.",
      avoidRules: `${baseAvoid} Do not repeat the same womenswear headline or full selling-point list across modules.`,
    };
  }
  return generic;
}

export const PRODUCT_SET_TEMPLATES: ProductSetTemplate[] = [
  template(1, "白底精修主图", "main", `${STYLE_BASE}/1.jpg`, "1:1", "纯白背景下呈现产品真实细节、光影体积感与商业高级感的标准化电商展示图。", "描述产品摆放角度、光影质感和主图留白要求。"),
  template(2, "商品细节特写白底图", "main", `${STYLE_BASE}/2.jpg`, "1:1", "白底下聚焦产品局部细节、材质纹理、工艺做工和功能特征的高清特写图。", "指定需要特写的部位及是否需要宫格展示。", { typeDescriptionV2: "白底下聚焦产品局部细节、材质纹理、工艺做工和功能特征。图片数量为1张时可采用宫格方式展现。" }),
  template(5, "多角度白底精修图", "main", `${STYLE_BASE}/4.jpg`, "1:1", "白底展示产品正面、侧面、背面等不同视角，保证视角统一、光影一致、质感统一。", "列出需要展示的视角及排列方式。", { typeDescriptionV2: "白底展示产品不同视角的完整外观。图片数量为1张时可采用宫格方式展现。" }),
  template(6, "模特上身/展示图", "main", `${STYLE_BASE}/5.jpg`, "3:4", "模特穿着商品进行展示，呈现商品全貌、侧面、背面或局部。", "描述模特特征、拍摄姿势及场景氛围。", { subjectConsistency: true, typeDescriptionV2: "模特穿着商品进行展示，人物姿势自然，适配电商展示风格，不要所有人物都看向镜头。" }),
  template(8, "商品单场景展示图", "main", `${STYLE_BASE}/6.jpg`, "3:4", "在干净场景中完整展示商品整体形态、使用氛围与视觉美感，突出产品与场景的协调性。", "描述具体场景风格及搭配道具。", { subjectConsistency: true, intelligentCopy: true }),
  template(12, "商品核心卖点解析图", "main", `${STYLE_BASE}/9.jpg`, "3:4", "聚焦商品核心功能、优势亮点和差异化价值，结合产品实拍与简洁视觉强化购买理由。", "输入核心卖点文字及期望的视觉排版风格。", { intelligentCopy: true }),
  template(25, "节日氛围图", "main", `${STYLE_BASE}/20.jpg`, "1:1", "在特定节日元素背景下展示产品，强调时间感、氛围感和购买迫切感。", "指定具体节日及希望出现的元素。", { intelligentCopy: true }),
  template(101, "女装白底精修主图", "main", `${STYLE_BASE}/1.jpg`, "1:1", "为女装商品生成干净高级的白底主图，保留版型、颜色、领口、袖型、腰线、裙摆或裤型等关键结构。", "强调面料垂感、廓形比例和电商主图留白。", { scenario: "womenswear" }),
  template(102, "女装通勤场景图", "main", `${STYLE_BASE}/6.jpg`, "3:4", "将女装置于办公室、街角、咖啡店或城市通勤场景，突出日常穿搭适配度和高级质感。", "描述通勤场景、模特姿态、搭配单品和自然光线。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear" }),
  template(103, "女装街拍Lookbook", "main", `${STYLE_BASE}/16.jpg`, "3:4", "生成小红书/独立站风格的女装街拍 Lookbook，强调穿搭氛围、自然动作和真实社交内容感。", "避免过度影棚感，人物表情自然，突出穿搭而不是脸部。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear" }),
  template(104, "女装搭配建议图", "main", `${STYLE_BASE}/7.jpg`, "4:5", "展示女装与鞋包、饰品、外套或内搭的成套搭配建议，适合主图辅图和社媒种草。", "根据商品颜色和风格推荐搭配组合，文案简短清晰。", { intelligentCopy: true, scenario: "womenswear" }),

  template(3, "商品细节特写白底图", "details", `${STYLE_BASE}/2.jpg`, "1:1", "白底下聚焦产品局部细节、材质纹理、工艺做工和功能特征的高清特写图。", "指定需要特写的部位及是否需要宫格展示。", { typeDescriptionV2: "白底下聚焦产品局部细节、材质纹理、工艺做工和功能特征。图片数量为1张时可采用宫格方式展现。" }),
  template(4, "商品细节特写图（非白底）", "details", `${STYLE_BASE}/3.jpg`, "3:4", "非白底背景下聚焦产品局部细节、材质纹理、工艺做工和功能特征，突出真实质感。", "描述背景环境及具体细节对焦位置。", { subjectConsistency: true, typeDescriptionV2: "非白底背景下聚焦产品局部核心细节。图片数量为1张时可采用宫格方式展现。" }),
  template(7, "模特上身/展示图", "details", `${STYLE_BASE}/5.jpg`, "3:4", "模特穿着商品进行展示，呈现商品全貌、侧面、背面或局部。", "描述模特特征、拍摄姿势及场景氛围。", { subjectConsistency: true, typeDescriptionV2: "模特穿着商品进行展示，人物姿势自然，适配电商展示风格。" }),
  template(9, "商品单场景展示图", "details", `${STYLE_BASE}/6.jpg`, "3:4", "在干净场景中完整展示商品整体形态、使用氛围与视觉美感，突出产品与场景的协调性。", "描述具体场景风格及搭配道具。", { subjectConsistency: true, intelligentCopy: true }),
  template(10, "商品多场景展示图", "details", `${STYLE_BASE}/7.jpg`, "3:4", "通过多个生活场景展现产品在不同环境下的应用状态与审美契合度。", "列举多个使用场景及每个场景下的产品形态。", { intelligentCopy: true, typeDescriptionV2: "通过多个生活场景展现产品通用性。图片数量为1张时可用宫格图展示，多图时每张图展示一个场景。" }),
  template(11, "商品尺寸/尺码图", "details", `${STYLE_BASE}/8.jpg`, "3:4", "清晰展示商品长宽高、直径、厚度等物理尺寸或尺码对照表，搭配简洁标尺或参考物。", "输入具体尺寸数据及是否需要参照物对比。", { intelligentCopy: true }),
  template(13, "商品核心卖点解析图", "details", `${STYLE_BASE}/9.jpg`, "3:4", "聚焦商品核心功能、优势亮点和差异化价值，结合产品实拍与简洁视觉突出卖点。", "输入核心卖点文字及期望的视觉排版风格。", { intelligentCopy: true }),
  template(14, "首屏海报图", "details", `${STYLE_BASE}/10.jpg`, "9:16", "电商详情页首屏视觉海报，构图大气、主题突出、氛围感强，快速传递产品定位与调性。", "描述海报主题、品牌调性及核心情绪。", { intelligentCopy: true }),
  template(15, "商品包装展示图", "details", `${STYLE_BASE}/11.jpg`, "3:4", "同时展示商品与完整包装形态，可呈现半开箱、包装与产品组合陈列等效果。", "描述包装开启状态及礼盒摆放布局。", { intelligentCopy: true }),
  template(17, "商品结构示意图", "details", `${STYLE_BASE}/13.jpg`, "3:4", "清晰展示商品内部结构、组成部件、分层结构、安装关系或原理示意。", "描述需要拆解展示的部件及标注重点。", { intelligentCopy: true }),
  template(18, "痛点对比/展示图", "details", `${STYLE_BASE}/14.jpg`, "3:4", "通过视觉对比或情景模拟还原用户痛点，并与产品带来的轻松、舒适或高效形成反差。", "描述用户困扰场景及产品解决效果。", { intelligentCopy: true }),
  template(19, "运输安装示意图", "details", `${STYLE_BASE}/15.jpg`, "3:4", "清晰展示商品运输方式、包装防护、拆箱步骤、安装流程、拼接方式与使用注意事项。", "按顺序列出关键安装步骤及工具需求。", { intelligentCopy: true }),
  template(21, "通用买家秀实拍图", "details", `${STYLE_BASE}/16.jpg`, "3:4", "模拟真实消费者的生活观察视角，在自然生活场景下呈现产品真实状态。", "描述真实生活场景及随意抓拍角度。", { subjectConsistency: true }),
  template(22, "商品材质说明图", "details", `${STYLE_BASE}/17.jpg`, "3:4", "清晰展示商品所用材质、面料、成分、纹理与质感，搭配文字标注说明材质特点。", "输入具体材质名称及希望强调的触感。", { intelligentCopy: true }),
  template(23, "核心成分展示图", "details", `${STYLE_BASE}/18.jpg`, "3:4", "清晰突出商品核心成分、原料、配料及其含量、优势、来源与功效。", "列举核心成分及构图方式。", { intelligentCopy: true }),
  template(24, "科技渲染拆解图", "details", `${STYLE_BASE}/19.jpg`, "3:4", "采用3D渲染或透视拆解效果，直观展示产品内部结构、核心科技、功能模块与工作原理。", "描述需要透视展示的科技点及整体配色。", { intelligentCopy: true }),
  template(26, "品牌/权威背书图", "details", `${STYLE_BASE}/21.jpg`, "3:4", "结合产品主体展示质检报告、专利证书、获奖奖杯、授权书或品牌历史墙，营造可信任感。", "说明背书类型及希望呈现的专业背景。", { intelligentCopy: true }),
  template(27, "使用步骤/教程图", "details", `${STYLE_BASE}/22.jpg`, "3:4", "通过序列化构图清晰展示产品使用方法或安装流程，包含手势引导或简单图示。", "描述手势动作及每个步骤的简洁说明。", { subjectConsistency: true, intelligentCopy: true }),
  template(105, "女装面料/版型细节图", "details", `${STYLE_BASE}/17.jpg`, "3:4", "聚焦女装面料纹理、缝线、领口、袖口、腰线、裙摆、纽扣或拉链等细节，突出做工和穿着质感。", "请结合商品图选择最值得展示的版型和面料细节。", { intelligentCopy: true, scenario: "womenswear" }),
  template(106, "女装尺码/试穿建议图", "details", `${STYLE_BASE}/8.jpg`, "3:4", "面向女装详情页展示尺码建议、版型宽松度、长度、腰围、肩宽或适合身形，帮助降低退换货。", "不要虚构具体尺码数据；如用户未提供，使用版型建议和测量位置示意。", { intelligentCopy: true, scenario: "womenswear" }),
  template(107, "女装小红书种草详情图", "details", `${STYLE_BASE}/16.jpg`, "3:4", "用社媒种草风格展示女装上身氛围、穿搭场景、适合季节和风格关键词，增强收藏与转化。", "文案自然短句，避免夸张功效和低质促销感。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear" }),
  template(108, "女装法式通勤首屏海报", "details", `${STYLE_BASE}/10.jpg`, "9:16", "为女装详情页生成法式通勤首屏海报，强调松弛高级、城市自然光、版型垂感与日常搭配。", "只负责第一屏氛围和款式定位，文案短，不要堆叠全部卖点。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装详情页首屏海报，负责建立款式调性和第一视觉记忆", contentScope: "Only cover style positioning, outfit atmosphere, season and core garment silhouette. Do not include size chart, full detail grid, or all selling points.", layoutRules: "Hero model or garment scene with refined whitespace, soft daylight, editorial ecommerce composition, one short headline and one subtitle.", textRules: "One headline plus one short subtitle, no dense bullet list.", avoidRules: "Do not repeat material grid, size advice, price badge, coupon style, or all feature bullets." } }),
  template(114, "女装韩系甜美首屏海报", "details", `${STYLE_BASE}/5.jpg`, "9:16", "为女装详情页生成韩系甜美首屏海报，明亮柔和、亲和自然，突出颜色、版型和轻盈穿搭感。", "适合柔和色系、少女感、休闲甜美、开衫、卫衣、裙装等商品；文案短句，不要幼态化。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装韩系甜美首屏海报，负责建立明亮亲和的第一视觉", contentScope: "Only cover color mood, approachable outfit atmosphere, season and core silhouette. Do not include material grid, size chart or every selling point.", layoutRules: "Bright soft daylight, adult model or clean garment scene, pastel accents, airy ecommerce composition, one headline and one short subtitle.", textRules: "One warm headline plus one short subtitle; no dense bullet list.", avoidRules: "Do not make the model childish, do not repeat detail thumbnails, size advice, price badge, or full selling-point list." } }),
  template(115, "女装户外机能首屏海报", "details", `${STYLE_BASE}/6.jpg`, "9:16", "为女装详情页生成户外/机能首屏海报，强调防护、通勤户外两用、行动感和可靠材质。", "适合冲锋衣、外套、防风防水、运动休闲、防护类服装；保持真实商业场景。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装户外机能首屏海报，负责建立功能场景和可靠感", contentScope: "Only cover function positioning, weather/use scene, movement and garment silhouette. Do not include full size chart, macro detail grid or all selling points.", layoutRules: "Outdoor or city-utility scene, practical adult model pose, crisp light, product structure visible, one headline and one short functional subtitle.", textRules: "Short functional headline plus subtitle only; no dense bullet list.", avoidRules: "Do not make fantasy adventure scenes, tactical overprops, repeated detail thumbnails, price badge, or complete feature stack." } }),
  template(116, "女装快时尚首屏海报", "details", `${STYLE_BASE}/5.jpg`, "9:16", "为女装详情页生成快时尚上新首屏海报，清爽直接，突出款式、颜色、上身比例和快速决策。", "适合 Shein、Temu、批量上新、快时尚目录；不要做复杂品牌大片。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装快时尚首屏海报，负责快速传达款式和上新氛围", contentScope: "Only cover new-arrival positioning, garment fit, color and simple outfit appeal. Do not include size chart, material grid or complete selling-point list.", layoutRules: "Clean catalog-like model hero, clear garment front, simple background, quick-scan typography, one headline and one short subtitle.", textRules: "Very concise launch copy; no paragraph, no dense callouts.", avoidRules: "Do not create a luxury editorial poster, do not add heavy stickers, detail grids, coupon labels, or all feature bullets." } }),
  template(117, "女装通用质感首屏海报", "details", `${STYLE_BASE}/10.jpg`, "9:16", "为女装详情页生成中性通用的质感首屏海报，根据商品气质自动决定通勤、休闲、品牌或生活方式方向。", "默认女装详情首屏使用；不强行套用法式、甜美或户外风格。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装通用详情页首屏海报，负责建立清晰款式定位和第一视觉", contentScope: "Only cover product category, core silhouette, wearing mood and one high-confidence style position. Do not force French, Korean sweet, outdoor or fast-fashion aesthetics unless explicitly requested.", layoutRules: "Neutral premium ecommerce hero with adult model or garment scene, accurate silhouette, clean whitespace, product-led palette, one headline and one subtitle.", textRules: "One neutral headline plus one short subtitle; no dense bullet list.", avoidRules: "Do not repeat material grid, size advice, price/coupon badge, all feature bullets, or a fixed French-commute composition." } }),
  template(118, "女装小红书种草首屏海报", "details", `${STYLE_BASE}/16.jpg`, "9:16", "为女装详情页生成小红书种草首屏海报，生活化、可收藏、自然分享感强，突出穿搭氛围。", "适合小红书、社媒种草、穿搭分享；文案像真实笔记标题，不要硬广堆词。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装小红书种草首屏海报，负责建立可收藏的生活方式入口", contentScope: "Only cover shareable outfit mood, scenario, season and one memorable style hook. Do not include size chart, macro detail grid or all selling points.", layoutRules: "Natural lifestyle framing, adult model or wearable scene, soft but realistic lighting, save-worthy composition, one notebook-like headline and one short subtitle.", textRules: "Short natural social-commerce copy, no hard-sell paragraph.", avoidRules: "Do not add exaggerated claims, coupon labels, repeated detail thumbnails, or the full selling-point list." } }),
  template(109, "女装韩系甜美上身图", "main", `${STYLE_BASE}/5.jpg`, "3:4", "生成韩系甜美女装上身展示图，明亮柔和、自然表情、强调款式可爱但不过度幼态。", "适合少女感、柔和色系、休闲甜美外套或裙装。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装韩系甜美模特上身图，负责展示亲和穿着效果", contentScope: "Focus on fit, softness, color mood and approachable outfit styling. Avoid size chart and technical material callouts.", layoutRules: "Bright soft scene, adult model, natural pose, clean ecommerce framing.", textRules: "Very short lifestyle captions only.", avoidRules: "No childish styling, no exaggerated sale labels, no repeated core selling-point list." } }),
  template(110, "女装户外机能场景图", "main", `${STYLE_BASE}/6.jpg`, "3:4", "生成女装户外/机能风场景图，强调防风、防水、耐穿、通勤户外两用等功能气质。", "适合冲锋衣、外套、运动休闲、防护类服装。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装户外机能场景图，负责展示功能场景和行动感", contentScope: "Focus on weather, movement, utility details and practical wearing scene. Do not create a size chart or white-background hero.", layoutRules: "Outdoor/city utility scene, crisp light, practical pose, product details visible.", textRules: "Short functional callouts only if relevant.", avoidRules: "No fantasy adventure, no overdesigned tactical props, no full selling-point repetition." } }),
  template(111, "女装快时尚目录图", "main", `${STYLE_BASE}/5.jpg`, "3:4", "生成快时尚平台风格的女装目录图，款式清楚、模特自然、适合批量上新和快速决策。", "强调清晰版型、颜色和搭配，不做复杂海报。", { subjectConsistency: true, intelligentCopy: false, scenario: "womenswear", guidance: { moduleRole: "女装快时尚目录图，负责清晰展示款式和上身版型", contentScope: "Show garment fit, length, color and simple outfit pairing. Keep it catalog-like.", layoutRules: "Clean model catalog photo, simple background, minimal styling, garment front clearly visible.", textRules: "No heavy copy; optional tiny category label only.", avoidRules: "No poster layout, no dense feature list, no decorative stickers." } }),
  template(112, "内衣/泳衣安全版型图", "details", `${STYLE_BASE}/5.jpg`, "3:4", "为内衣或泳衣生成保守商业目录式版型展示，强调剪裁、支撑、面料与尺码参考，不做性感化表达。", "必须使用成年模特或平铺/假模特，非情色、非暴露强化、无卧室暗示。", { subjectConsistency: true, intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "内衣/泳衣安全版型图，负责保守展示版型和穿着参考", contentScope: "Adult commercial catalog fit only. Focus on cut, support, fabric and size guidance. Avoid erotic mood.", layoutRules: "Conservative catalog pose or flat-lay/mannequin, neutral background, no bedroom setting.", textRules: "Factual fit and fabric labels only.", avoidRules: "No nudity, no transparent exposure, no sexualized pose, no minors or minor-looking people." } }),
  template(113, "女装搭配胶囊方案图", "details", `${STYLE_BASE}/7.jpg`, "3:4", "展示一件女装可搭配的鞋包、内搭、下装或配饰组合，帮助用户理解一衣多穿。", "只负责搭配方案，不重复材质、尺码和全部卖点。", { intelligentCopy: true, scenario: "womenswear", guidance: { moduleRole: "女装搭配胶囊方案图，负责一衣多穿和搭配转化", contentScope: "Show 2-3 outfit combinations or accessory pairings derived from the uploaded garment style and color.", layoutRules: "Clean outfit collage or split layout, consistent palette, product remains the center.", textRules: "Short outfit labels, no long paragraph.", avoidRules: "Do not create size chart, material macro grid, or duplicate hero poster." } }),
];

export const PRODUCT_SET_PRESET_PLANS: ProductSetPresetPlan[] = [
  {
    id: "smart",
    name: "智能推荐",
    description: "按当前类型自动组合主图、场景、细节和卖点图。",
    imageType: "main",
    templateIds: [],
    platformHint: "通用",
  },
  {
    id: "taobao-main",
    name: "淘宝主图辅图",
    description: "白底主图、场景图、细节图、多角度和卖点解析，适合商品 item 首屏。",
    imageType: "main",
    templateIds: [1, 8, 2, 5, 12],
    platformHint: "淘宝 / 京东 / 拼多多",
  },
  {
    id: "amazon-listing",
    name: "亚马逊 Listing",
    description: "主图合规、细节、尺寸、场景和核心卖点，偏跨境平台信息密度。",
    imageType: "main",
    templateIds: [1, 5, 2, 12, 8],
    platformHint: "亚马逊 / eBay / Shopify",
  },
  {
    id: "details-basic",
    name: "详情页基础套图",
    description: "首屏海报、卖点、细节、尺寸、材质和场景模块。",
    imageType: "details",
    templateIds: [14, 13, 3, 11, 22, 10],
    platformHint: "淘宝 / 京东 / 独立站",
  },
  {
    id: "women-main",
    name: "女装上新主图",
    description: "白底精修、通勤场景、街拍 Lookbook、搭配建议和细节特写。",
    imageType: "main",
    templateIds: [101, 111, 102, 103, 104, 2],
    platformHint: "淘宝 / 小红书 / Shein",
    scenario: "womenswear",
  },
  {
    id: "women-detail",
    name: "女装详情页转化",
    description: "首屏海报、面料版型、尺码试穿、种草场景和核心卖点。",
    imageType: "details",
    templateIds: [117, 105, 106, 107, 113, 7, 13, 21],
    platformHint: "淘宝 / 小红书 / 独立站",
    scenario: "womenswear",
  },
];

const SMART_ORDER_GENERAL: Record<ProductSetImageType, number[]> = {
  main: [1, 8, 2, 5, 6, 12, 25],
  details: [14, 13, 3, 11, 22, 10, 18, 27, 15, 17, 24, 26, 21],
};

const SMART_ORDER_APPAREL: Record<ProductSetImageType, number[]> = {
  main: [101, 111, 102, 109, 110, 103, 104, 2, 5, 12],
  details: [117, 105, 106, 107, 113, 7, 13, 21, 3],
};

const SMART_ORDER_INTIMATE: Record<ProductSetImageType, number[]> = {
  main: [101, 2, 5, 12, 8, 104],
  details: [112, 105, 106, 13, 3, 21],
};

function uniqueTemplateIds(ids: number[]) {
  return Array.from(new Set(ids));
}

function getWomenswearHeroTemplateId(
  profile: ProductSetProductProfile,
  settings?: ProductSetSettings
) {
  const stylePackId = normalizeProductSetStylePackId(settings?.stylePackId);
  if (stylePackId === "french_commute") return 108;
  if (stylePackId === "korean_sweet") return 114;
  if (stylePackId === "outdoor_utility") return 115;
  if (stylePackId === "xiaohongshu_girl") return 118;
  if (stylePackId === "minimal_indie") return 117;
  if (stylePackId === "shein_fastfashion") return 116;

  const platform = `${settings?.platform || ""}`.toLowerCase();
  const profileText = [
    profile.displayName,
    ...profile.visualKeywords,
  ].join(" ").toLowerCase();

  if (/shein|temu|快时尚|批量上新|new arrival|fast fashion/.test(`${platform} ${profileText}`)) return 116;
  if (/小红书|种草|xiaohongshu/.test(`${platform} ${profileText}`)) return 118;
  if (/韩|甜美|少女|软糯|可爱|pastel|sweet|cute|korean/.test(profileText)) return 114;
  if (/户外|机能|冲锋|防风|防水|运动|骑行|徒步|utility|outdoor|weatherproof|sportswear/.test(profileText)) return 115;
  if (/法式|french/.test(profileText)) return 108;
  return 117;
}

const DEFAULT_SETTINGS: ProductSetSettings = {
  country: "中国",
  language: "中文",
  platform: "淘宝",
  themeMode: "auto",
  themeColor: "智能主题色",
  fontStyle: "auto",
  stylePackId: "auto",
  extraDescription: "",
  visualDirectorScript: "",
};

const DEFAULT_PRODUCT_PROFILE: ProductSetProductProfile = {
  kind: "general",
  apparelType: "general",
  displayName: "通用商品",
  confidence: 0.35,
  isApparel: false,
  needsModel: false,
  modelStrategy: "none",
  modelBrief: "不使用真人模特，优先商品白底、场景、尺寸、材质和使用说明。",
  recommendedMainPlanId: "taobao-main",
  recommendedDetailsPlanId: "details-basic",
  planningNotes: ["按通用电商商品生成白底、场景、细节、尺寸和卖点模块。"],
  visualKeywords: ["clean ecommerce", "product hero", "detail clarity"],
};

export function normalizeProductSetImageType(value: unknown): ProductSetImageType {
  return value === "details" ? "details" : "main";
}

export function normalizeProductSetCreationMode(value: unknown): ProductSetCreationMode {
  return value === "custom" ? "custom" : "smart";
}

export function normalizeProductSetThemeMode(value: unknown): ProductSetThemeMode {
  return value === "custom" ? "custom" : "auto";
}

export function normalizeProductSetFontStyle(value: unknown): ProductSetFontStyle {
  return value === "minimal" || value === "elegant" || value === "bold" || value === "handwritten" || value === "custom"
    ? value
    : "auto";
}

export function normalizeProductSetStylePackId(value: unknown): ProductSetStylePackId {
  return value === "french_commute" || value === "korean_sweet" || value === "outdoor_utility" || value === "xiaohongshu_girl" || value === "minimal_indie" || value === "shein_fastfashion"
    ? value
    : "auto";
}

export function normalizeProductSetCopyDensity(value: unknown, fallback: ProductSetCopyDensity = "standard"): ProductSetCopyDensity {
  return value === "none" || value === "light" || value === "standard" || value === "rich" ? value : fallback;
}

export function normalizeProductSetSettings(value: unknown): ProductSetSettings {
  const input = value && typeof value === "object" ? value as Partial<ProductSetSettings> : {};
  return {
    country: safeText(input.country, DEFAULT_SETTINGS.country, 40),
    language: safeText(input.language, DEFAULT_SETTINGS.language, 40),
    platform: safeText(input.platform, DEFAULT_SETTINGS.platform, 40),
    themeMode: normalizeProductSetThemeMode(input.themeMode),
    themeColor: safeText(input.themeColor, DEFAULT_SETTINGS.themeColor, 80),
    fontStyle: normalizeProductSetFontStyle(input.fontStyle),
    stylePackId: normalizeProductSetStylePackId(input.stylePackId),
    extraDescription: safeText(input.extraDescription, "", 600),
    visualDirectorScript: safeText(input.visualDirectorScript, "", 3200),
    visualDirectorPlan: normalizeProductSetVisualDirectorPlan(input.visualDirectorPlan),
  };
}

export function normalizeProductSetVisualDirectorPlan(value: unknown): ProductSetVisualDirectorPlan | undefined {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!input) return undefined;

  const plan: ProductSetVisualDirectorPlan = {
    strategyName: readDirectorText(input, "strategyName", "strategy_name", 100),
    styleStrategy: readDirectorText(input, "styleStrategy", "style_strategy", 500),
    globalStrategy: normalizeProductSetGlobalVisualStrategy(input.globalStrategy || input.global_strategy),
    mainPlan: normalizeProductSetDirectorModules(input.mainPlan || input.main_plan, 4),
    detailsPlan: normalizeProductSetDirectorModules(input.detailsPlan || input.details_plan, 8),
    mainScripts: normalizeProductSetDirectorScripts(input.mainScripts || input.main_scripts, 4),
    detailsScripts: normalizeProductSetDirectorScripts(input.detailsScripts || input.details_scripts, 8),
    layoutPrinciples: normalizeStringArray(input.layoutPrinciples || input.layout_principles, [], 8, 140),
    copyStrategy: readDirectorText(input, "copyStrategy", "copy_strategy", 500),
    negativeLayouts: normalizeStringArray(input.negativeLayouts || input.negative_layouts, [], 8, 140),
  };

  const hasPlan =
    plan.strategyName ||
    plan.styleStrategy ||
    plan.mainPlan.length ||
    plan.detailsPlan.length ||
    plan.mainScripts.length ||
    plan.detailsScripts.length;
  return hasPlan ? plan : undefined;
}

export function getProductSetVisualDirectorPlanCount(
  plan: ProductSetVisualDirectorPlan | undefined,
  imageType: ProductSetImageType
) {
  if (!plan) return 0;
  const scripts = imageType === "main" ? plan.mainScripts : plan.detailsScripts;
  const modules = imageType === "main" ? plan.mainPlan : plan.detailsPlan;
  return scripts.length || modules.length || 0;
}

export function normalizeProductSetProductProfile(value: unknown, productInfo = ""): ProductSetProductProfile {
  const inferred = inferProductSetProductProfile(productInfo);
  const input = value && typeof value === "object" ? value as Partial<ProductSetProductProfile> : {};
  const kind = normalizeProductKind(input.kind, inferred.kind);
  const apparelType = normalizeApparelType(input.apparelType, inferred.apparelType);
  const isApparel = typeof input.isApparel === "boolean" ? input.isApparel : kind === "apparel" || kind === "footwear" || inferred.isApparel;
  const strategy = normalizeModelStrategy(input.modelStrategy, inferred.modelStrategy);
  const needsModel = typeof input.needsModel === "boolean" ? input.needsModel : strategy === "recommended" || strategy === "required";
  return {
    kind,
    apparelType,
    displayName: safeText(input.displayName, inferred.displayName || DEFAULT_PRODUCT_PROFILE.displayName, 80),
    confidence: clampConfidence(input.confidence, inferred.confidence),
    isApparel,
    needsModel,
    modelStrategy: strategy,
    modelBrief: safeText(input.modelBrief, inferred.modelBrief || DEFAULT_PRODUCT_PROFILE.modelBrief, 220),
    recommendedMainPlanId: safeText(input.recommendedMainPlanId, inferRecommendedPlanId("main", { kind, apparelType, isApparel, needsModel }), 40),
    recommendedDetailsPlanId: safeText(input.recommendedDetailsPlanId, inferRecommendedPlanId("details", { kind, apparelType, isApparel, needsModel }), 40),
    planningNotes: normalizeStringArray(input.planningNotes, inferred.planningNotes, 5, 120),
    visualKeywords: normalizeStringArray(input.visualKeywords, inferred.visualKeywords, 8, 60),
  };
}

export function inferProductSetProductProfile(productInfo = ""): ProductSetProductProfile {
  const text = productInfo.toLowerCase();
  const hasAny = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  const apparel = hasAny(["女装", "男装", "童装", "衣", "裙", "裤", "外套", "夹克", "卫衣", "衬衫", "t恤", "T恤", "连帽", "面料", "版型", "袖", "领口", "下摆", "穿着", "上身"]);
  const footwear = hasAny(["鞋", "靴", "运动鞋", "凉鞋", "皮鞋", "鞋底", "鞋面"]);
  const intimate = hasAny(["内衣", "文胸", "胸罩", "泳衣", "泳装", "比基尼", "bra", "bikini"]);
  const womenswear = hasAny(["女装", "女士", "女性", "裙", "连衣裙", "半身裙", "打底裤", "文胸", "泳衣", "少女", "甜美", "法式", "通勤"]);
  const menswear = hasAny(["男装", "男士", "男性", "西装", "工装裤", "男款"]);
  const kidswear = hasAny(["童装", "儿童", "宝宝", "婴儿", "幼儿", "小童", "中童", "大童"]);
  const outerwear = hasAny(["外套", "夹克", "冲锋衣", "风衣", "大衣", "羽绒服", "连帽"]);
  const sportswear = hasAny(["运动", "瑜伽", "骑行", "跑步", "健身"]);

  if (intimate) {
    return {
      ...DEFAULT_PRODUCT_PROFILE,
      kind: "apparel",
      apparelType: hasAny(["泳衣", "泳装", "比基尼", "bikini"]) ? "swimwear" : "intimate",
      displayName: "内衣/泳装类服装",
      confidence: 0.82,
      isApparel: true,
      needsModel: true,
      modelStrategy: "recommended",
      modelBrief: "使用成年模特或保守商业目录式穿着展示，姿势自然克制，避免性感化、裸露强化、未成年或未成年感人物。",
      recommendedMainPlanId: "women-main",
      recommendedDetailsPlanId: "women-detail",
      planningNotes: ["适合加入模特上身、面料细节和尺码建议，但需要保守商业表达。", "避免性感姿势、卧室氛围和未成年感模特。"],
      visualKeywords: ["adult catalog", "conservative styling", "fit detail", "clean ecommerce"],
    };
  }

  if (apparel || footwear) {
    const apparelType: ProductSetApparelType = kidswear
      ? "kidswear"
      : womenswear
        ? "womenswear"
        : menswear
          ? "menswear"
          : outerwear
            ? "outerwear"
            : sportswear
              ? "sportswear"
              : "general";
    return {
      ...DEFAULT_PRODUCT_PROFILE,
      kind: footwear && !apparel ? "footwear" : "apparel",
      apparelType,
      displayName: apparelType === "womenswear" ? "女装商品" : apparelType === "menswear" ? "男装商品" : apparelType === "kidswear" ? "童装商品" : footwear ? "鞋靴商品" : "服装商品",
      confidence: productInfo.trim() ? 0.74 : 0.5,
      isApparel: true,
      needsModel: true,
      modelStrategy: "recommended",
      modelBrief: buildDefaultModelBrief(apparelType, footwear),
      recommendedMainPlanId: apparelType === "womenswear" || apparelType === "general" || apparelType === "outerwear" ? "women-main" : "taobao-main",
      recommendedDetailsPlanId: apparelType === "womenswear" || apparelType === "general" || apparelType === "outerwear" ? "women-detail" : "details-basic",
      planningNotes: ["服装类默认应包含至少一张模特上身/穿搭图，帮助判断版型、长度、垂感和使用场景。", "细节、尺码和白底图应与模特场景分工，不重复同一组卖点。"],
      visualKeywords: ["model fit", "outfit styling", "fabric detail", "size guidance", "lookbook"],
    };
  }

  const kind: ProductSetProductKind = hasAny(["口红", "面霜", "精华", "护肤", "美妆", "香水"]) ? "beauty"
    : hasAny(["椅", "桌", "床", "灯", "家居", "沙发"]) ? "home"
      : hasAny(["手机", "耳机", "充电", "电器", "风扇", "键盘", "电动"]) ? "electronics"
        : hasAny(["玩具", "积木", "毛绒"]) ? "toy"
          : hasAny(["食品", "零食", "饮料", "咖啡"]) ? "food"
            : "general";
  return {
    ...DEFAULT_PRODUCT_PROFILE,
    kind,
    displayName: kind === "general" ? "通用商品" : `${kind} 商品`,
    confidence: productInfo.trim() ? 0.62 : DEFAULT_PRODUCT_PROFILE.confidence,
  };
}

export function getSmartProductSetTemplateIds(input: {
  imageType: ProductSetImageType;
  productProfile?: ProductSetProductProfile;
  settings?: ProductSetSettings;
}) {
  const profile = normalizeProductSetProductProfile(input.productProfile);
  if (profile.isApparel) {
    if (profile.apparelType === "intimate" || profile.apparelType === "swimwear") return SMART_ORDER_INTIMATE[input.imageType];
    const womenswearHeroId = getWomenswearHeroTemplateId(profile, input.settings);
    if (profile.apparelType === "outerwear" || profile.apparelType === "sportswear") {
      return input.imageType === "main"
        ? [101, 110, 111, 102, 103, 104, 2, 5, 12]
        : uniqueTemplateIds([womenswearHeroId, 105, 106, 107, 113, 7, 13, 21, 3]);
    }
    return input.imageType === "details"
      ? uniqueTemplateIds([womenswearHeroId, ...SMART_ORDER_APPAREL.details.filter((id) => id !== womenswearHeroId)])
      : SMART_ORDER_APPAREL.main;
  }
  if (profile.kind === "footwear") {
    return input.imageType === "main" ? [1, 8, 2, 5, 12, 25] : [14, 9, 3, 11, 22, 21, 13];
  }
  if (profile.kind === "beauty" || profile.kind === "food") {
    return input.imageType === "main" ? [1, 8, 2, 12, 25] : [14, 23, 22, 13, 3, 21, 26];
  }
  if (profile.kind === "electronics" || profile.kind === "home") {
    return input.imageType === "main" ? [1, 8, 2, 12, 5] : [14, 13, 24, 17, 11, 27, 21];
  }
  return SMART_ORDER_GENERAL[input.imageType];
}

export function getProductSetTemplates(imageType: ProductSetImageType) {
  return PRODUCT_SET_TEMPLATES.filter((item) => item.imageType === imageType);
}

export function getProductSetTemplate(id: number) {
  return PRODUCT_SET_TEMPLATES.find((item) => item.id === id);
}

export function getProductSetStylePack(id?: ProductSetStylePackId) {
  return PRODUCT_SET_STYLE_PACKS.find((item) => item.id === normalizeProductSetStylePackId(id)) || PRODUCT_SET_STYLE_PACKS[0];
}

export function getProductSetModuleKey(template: Pick<ProductSetResolvedTemplate, "source" | "id">, index: number) {
  void index;
  return `${template.source}:${String(template.id)}`;
}

export function createProductSetModuleResult(
  template: ProductSetResolvedTemplate,
  index: number,
  patch: Partial<ProductSetModuleResult> = {}
): ProductSetModuleResult {
  return {
    moduleKey: getProductSetModuleKey(template, index),
    index: index + 1,
    templateId: String(template.id),
    templateSource: template.source,
    name: template.name,
    imageType: template.imageType,
    aspectRatio: template.aspectRatio,
    moduleRole: template.moduleRole,
    contentScope: template.contentScope,
    status: "queued",
    progress: 0,
    promptVersion: PRODUCT_SET_PROMPT_VERSION,
    ...patch,
  };
}

export function normalizeProductSetModuleResults(value: unknown): ProductSetModuleResult[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item): ProductSetModuleResult | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as Partial<ProductSetModuleResult>;
      const moduleKey = safeText(input.moduleKey, "", 100);
      if (!moduleKey) return null;
      const status = normalizeProductSetModuleStatus(input.status);
      return {
        moduleKey,
        index: normalizePositiveInteger(input.index, 1, 24),
        templateId: safeText(input.templateId, moduleKey, 80),
        templateSource: input.templateSource === "custom" ? "custom" : "preset",
        name: safeText(input.name, "商品套图模块", 80),
        imageType: normalizeProductSetImageType(input.imageType),
        aspectRatio: normalizeProductSetAspectRatio(input.aspectRatio) || "3:4",
        moduleRole: safeOptionalText(input.moduleRole, 180),
        contentScope: safeOptionalText(input.contentScope, 360),
        status,
        progress: status === "completed" ? 100 : Math.min(clampPercent(input.progress), 99),
        resultUrl: safeOptionalText(input.resultUrl, 1200),
        error: safeOptionalText(input.error, 500),
        taskId: safeOptionalText(input.taskId, 160),
        providerStatus: safeOptionalText(input.providerStatus, 80),
        attempt: normalizeOptionalPositiveInteger(input.attempt, 4),
        startedAt: safeOptionalText(input.startedAt, 80),
        updatedAt: safeOptionalText(input.updatedAt, 80),
        completedAt: safeOptionalText(input.completedAt, 80),
        durationMs: normalizeOptionalDuration(input.durationMs),
        promptVersion: safeOptionalText(input.promptVersion, 80),
        promptVariant: safeOptionalText(input.promptVariant, 80),
        promptHash: safeOptionalText(input.promptHash, 80),
        qualityScore: normalizeOptionalScore(input.qualityScore),
        qualityIssues: normalizeStringArray(input.qualityIssues, [], 8, 160),
        qualitySummary: safeOptionalText(input.qualitySummary, 240),
        qualitySource: safeOptionalText(input.qualitySource, 80),
      };
    })
    .filter((item): item is ProductSetModuleResult => Boolean(item))
    .sort((a, b) => a.index - b.index)
    .slice(0, 24);
}

export function getProductSetResultUrlsFromModules(modules: ProductSetModuleResult[]) {
  return normalizeProductSetModuleResults(modules)
    .filter((item) => item.status === "completed" && Boolean(item.resultUrl))
    .map((item) => item.resultUrl as string);
}

export function normalizeProductSetModuleOverrides(value: unknown): ProductSetModuleOverride[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item): ProductSetModuleOverride | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as Partial<ProductSetModuleOverride>;
      const key = safeText(input.key, "", 80);
      if (!key) return null;
      const override: ProductSetModuleOverride = { key };
      if (typeof input.disabled === "boolean") override.disabled = input.disabled;
      if (typeof input.subjectConsistency === "boolean") override.subjectConsistency = input.subjectConsistency;
      if (typeof input.modelConsistency === "boolean") override.modelConsistency = input.modelConsistency;
      if (typeof input.intelligentCopy === "boolean") override.intelligentCopy = input.intelligentCopy;
      override.name = safeOptionalText(input.name, 40);
      override.moduleRole = safeOptionalText(input.moduleRole, 160);
      override.contentScope = safeOptionalText(input.contentScope, 320);
      override.layoutRules = safeOptionalText(input.layoutRules, 320);
      override.textRules = safeOptionalText(input.textRules, 260);
      override.avoidRules = safeOptionalText(input.avoidRules, 320);
      override.typeDescription = safeOptionalText(input.typeDescription, 700);
      override.extraDescription = safeOptionalText(input.extraDescription, 700);
      override.aspectRatio = normalizeProductSetAspectRatio(input.aspectRatio);
      override.copyDensity = normalizeOptionalProductSetCopyDensity(input.copyDensity);
      return override;
    })
    .filter((item): item is ProductSetModuleOverride => Boolean(item))
    .slice(0, 10);
}

export function applyProductSetModuleOverrides(templates: ProductSetResolvedTemplate[], value: unknown): ProductSetResolvedTemplate[] {
  const overrides = normalizeProductSetModuleOverrides(value);
  if (!overrides.length) return templates;
  const byKey = new Map(overrides.map((item) => [item.key, item]));
  return templates
    .map((template, index): ProductSetResolvedTemplate | null => {
      const override = byKey.get(getProductSetModuleKey(template, index));
      if (!override) return template;
      if (override.disabled) return null;
      const typeDescription = override.typeDescription || template.typeDescription;
      const innerExtraDescription = override.extraDescription
        ? [template.innerExtraDescription, override.extraDescription].filter(Boolean).join("\n")
        : template.innerExtraDescription;
      return {
        ...template,
        name: override.name || template.name,
        moduleRole: override.moduleRole || template.moduleRole,
        contentScope: override.contentScope || template.contentScope,
        layoutRules: override.layoutRules || template.layoutRules,
        textRules: override.textRules || template.textRules,
        avoidRules: override.avoidRules || template.avoidRules,
        typeDescription,
        typeDescriptionV2: override.typeDescription || template.typeDescriptionV2 || typeDescription,
        innerExtraDescription,
        aspectRatio: override.aspectRatio || template.aspectRatio,
        subjectConsistency: override.subjectConsistency ?? template.subjectConsistency,
        modelConsistency: override.modelConsistency ?? template.modelConsistency,
        intelligentCopy: override.intelligentCopy ?? template.intelligentCopy,
        copyDensity: override.copyDensity || template.copyDensity,
      };
    })
    .filter((item): item is ProductSetResolvedTemplate => Boolean(item))
    .slice(0, 10);
}

export function getProductSetModuleReason(template: ProductSetResolvedTemplate, productProfile?: ProductSetProductProfile) {
  const profile = normalizeProductSetProductProfile(productProfile);
  if (shouldUseModelForTemplate(template, profile)) {
    return profile.isApparel
      ? "用于展示上身效果、版型和真实穿搭氛围，和细节/尺码模块分工。"
      : "用于提供真实使用状态，但不替代白底、细节或参数模块。";
  }
  const text = `${template.name} ${template.moduleRole} ${template.contentScope}`.toLowerCase();
  if (/白底|主图|hero/.test(text)) return "负责干净展示商品全貌，尽量不堆文案，保证平台主图可用。";
  if (/细节|材质|面料|纹理/.test(text)) return "负责聚焦局部工艺和材质，避免重复整套卖点文案。";
  if (/尺码|尺寸|试穿/.test(text)) return "负责降低尺寸/版型决策成本，只呈现该模块相关信息。";
  if (/海报|首屏/.test(text)) return "负责建立详情页第一屏视觉定位，文案更短、构图更强。";
  if (/卖点|痛点|对比/.test(text)) return "负责提炼购买理由，但只选当前模块最相关的少量卖点。";
  if (/场景|买家秀|种草|lookbook/.test(text)) return "负责生活方式和使用氛围，不重复白底或参数信息。";
  return "用于补齐套图中的一个独立内容模块，和其它图片保持差异化。";
}

function buildAiProductSetTemplates(input: {
  imageType: ProductSetImageType;
  count: number;
  productProfile?: ProductSetProductProfile;
  settings?: ProductSetSettings;
}): ProductSetResolvedTemplate[] {
  const profile = normalizeProductSetProductProfile(input.productProfile);
  const plan = normalizeProductSetSettings(input.settings).visualDirectorPlan;
  const scripts = input.imageType === "main" ? plan?.mainScripts || [] : plan?.detailsScripts || [];
  const modules = input.imageType === "main" ? plan?.mainPlan || [] : plan?.detailsPlan || [];
  const scriptModules = buildDirectorScriptModules(scripts, modules);
  const usedKeys = new Set(scriptModules.map((item, index) => normalizeAiModuleKey(item.module.moduleKey, index)));
  const fallbackModules = buildFallbackAiDirectorModules(input.imageType, profile, input.count)
    .filter((item, index) => !usedKeys.has(normalizeAiModuleKey(item.module.moduleKey, index)));
  const modulesToUse = [...scriptModules, ...fallbackModules].slice(0, input.count);

  return modulesToUse.map((item, index) => buildAiProductSetTemplate({
    imageType: input.imageType,
    profile,
    plan,
    module: item.module,
    script: item.script,
    index,
  }));
}

function buildDirectorScriptModules(
  scripts: ProductSetVisualDirectorScreenScript[],
  modules: ProductSetVisualDirectorModule[]
) {
  const moduleByKey = new Map(modules.map((module) => [module.moduleKey, module]));
  const used = new Set<string>();
  const fromScripts = scripts.map((script, index) => {
    const module = moduleByKey.get(script.moduleKey) || modules[index] || {
      moduleKey: script.moduleKey || `screen_${index + 1}`,
      purpose: script.title,
      layout: script.visualComposition || script.layoutRules,
      copyRule: script.copyContent,
    };
    used.add(module.moduleKey);
    return { module, script };
  });
  const remaining = modules
    .filter((module) => !used.has(module.moduleKey))
    .map((module) => ({ module, script: undefined }));
  return [...fromScripts, ...remaining];
}

function buildFallbackAiDirectorModules(
  imageType: ProductSetImageType,
  profile: ProductSetProductProfile,
  count: number
): Array<{ module: ProductSetVisualDirectorModule; script?: ProductSetVisualDirectorScreenScript }> {
  const mainKeys = profile.isApparel
    ? ["cover_main", "catalog_model", "detail_closeup", "lifestyle_scene", "white_background", "selling_point"]
    : ["cover_main", "white_background", "detail_closeup", "lifestyle_scene", "selling_point", "multi_angle"];
  const detailKeys = profile.isApparel
    ? ["hero", "wearing_proof", "material_fit_detail", "size_fit_guide", "lifestyle_story", "outfit_pairing", "selling_points", "trust"]
    : ["hero", "material_fit_detail", "selling_points", "lifestyle_story", "trust", "tutorial", "size_fit_guide", "buyer_show"];
  const keys = (imageType === "main" ? mainKeys : detailKeys).slice(0, count);
  return keys.map((key) => ({ module: fallbackDirectorModule(key, imageType, profile) }));
}

function fallbackDirectorModule(
  moduleKey: string,
  imageType: ProductSetImageType,
  profile: ProductSetProductProfile
): ProductSetVisualDirectorModule {
  const label = getAiModuleLabel(moduleKey, imageType);
  const apparelContext = profile.isApparel
    ? `Use ${profile.modelBrief}`
    : "Focus on product evidence, use state, structure, material, and purchase confidence.";
  return {
    moduleKey,
    purpose: label.role,
    layout: `${label.layout} ${apparelContext}`,
    copyRule: label.copyRule,
  };
}

function buildAiProductSetTemplate(input: {
  imageType: ProductSetImageType;
  profile: ProductSetProductProfile;
  plan?: ProductSetVisualDirectorPlan;
  module: ProductSetVisualDirectorModule;
  script?: ProductSetVisualDirectorScreenScript;
  index: number;
}): ProductSetResolvedTemplate {
  const key = normalizeAiModuleKey(input.module.moduleKey, input.index);
  const label = getAiModuleLabel(key, input.imageType);
  const title = input.script?.title || input.module.purpose || label.name;
  const moduleRole = input.module.purpose || input.script?.title || label.role;
  const contentScope = [
    input.script?.sceneDesign,
    input.script?.visualComposition,
    input.module.layout,
  ].filter(Boolean).join(" ");
  const layoutRules = [
    input.script?.globalTone ? `Global tone: ${input.script.globalTone}.` : "",
    input.script?.visualComposition ? `Composition: ${input.script.visualComposition}.` : "",
    input.script?.layoutRules ? `Layout: ${input.script.layoutRules}.` : "",
    input.module.layout ? `Module layout: ${input.module.layout}.` : "",
    buildGlobalVisualStrategyLine(input.plan?.globalStrategy),
    input.plan?.layoutPrinciples.length ? `Shared layout principles: ${input.plan.layoutPrinciples.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
  const textRules = [
    input.script?.copyContent ? `Screen copy: ${input.script.copyContent}.` : "",
    input.module.copyRule ? `Module copy rule: ${input.module.copyRule}.` : "",
    input.plan?.copyStrategy ? `Global copy strategy: ${input.plan.copyStrategy}.` : "",
    label.copyRule,
  ].filter(Boolean).join(" ");
  const avoidRules = [
    input.script?.constraints,
    input.plan?.negativeLayouts.join("; "),
    label.avoidRule,
    "Do not borrow gender, model styling, garment type, product shape, or brand cues from any local preset library.",
  ].filter(Boolean).join(" ");
  const brief = [
    `AI visual analysis module: ${title}.`,
    input.plan?.strategyName ? `Strategy: ${input.plan.strategyName}.` : "",
    input.plan?.styleStrategy ? `Style strategy: ${input.plan.styleStrategy}.` : "",
    input.script?.sceneDesign ? `Scene design: ${input.script.sceneDesign}.` : "",
    input.script?.visualComposition ? `Visual composition: ${input.script.visualComposition}.` : "",
    input.module.layout ? `Director layout: ${input.module.layout}.` : "",
    `Product profile: ${input.profile.displayName}, kind=${input.profile.kind}, apparelType=${input.profile.apparelType}.`,
  ].filter(Boolean).join(" ");

  return {
    source: "ai",
    id: `ai-${input.imageType}-${input.index + 1}-${key}`,
    name: title || label.name,
    imageType: input.imageType,
    aspectRatio: resolveAiTemplateAspectRatio(key, input.imageType),
    moduleRole,
    contentScope: contentScope || label.role,
    layoutRules: layoutRules || label.layout,
    textRules: textRules || label.copyRule,
    avoidRules,
    typeDescription: brief,
    typeDescriptionV2: brief,
    batchSize: 1,
    subjectConsistency: true,
    modelConsistency: /model|wearing|fit|outfit|lifestyle|catalog|proof/i.test(key),
    intelligentCopy: true,
    copyDensity: resolveAiCopyDensity(key),
    innerExtraDescription: [
      "This module was created from AI visual analysis, not from a local preset template.",
      input.script ? formatAiDirectorScript(input.script) : "",
      input.module.layout ? `Module layout from analysis: ${input.module.layout}` : "",
    ].filter(Boolean).join("\n"),
    scenario: "general",
  };
}

function normalizeAiModuleKey(value: string, index: number) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_/-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || `screen_${index + 1}`;
}

function getAiModuleLabel(moduleKey: string, imageType: ProductSetImageType) {
  const key = moduleKey.toLowerCase();
  if (/white|clean|cutout/.test(key)) {
    return {
      name: "AI clean product proof",
      role: "Clean product proof with accurate shape, color, material, and shadow.",
      layout: "Use a clean platform-ready product composition with restrained copy and no model unless the product image already contains one.",
      copyRule: "No dense text; optional one short factual label only.",
      avoidRule: "Avoid lifestyle props, invented badges, and unrelated model scenes.",
    };
  }
  if (/catalog|model|wearing|proof|fit|try/.test(key)) {
    return {
      name: "AI wearing proof",
      role: "Wearing or usage proof matched to the product's real target audience.",
      layout: "Use the model gender, age range, pose, and styling inferred from visual analysis and product profile.",
      copyRule: "Minimal headline or no text; let fit and wearing state carry the module.",
      avoidRule: "Avoid changing apparel gender, turning menswear into womenswear, or using unrelated preset model styling.",
    };
  }
  if (/material|detail|close|fabric|texture|fit_detail/.test(key)) {
    return {
      name: "AI material detail",
      role: "Material, structure, craftsmanship, and visible product details.",
      layout: "Use close-up evidence, macro crops, callout lines, and a small full-product context area.",
      copyRule: "Use up to four large factual labels derived from visible details.",
      avoidRule: "Avoid fake material claims, tiny tables, and repeated hero-poster wording.",
    };
  }
  if (/size|guide|measure/.test(key)) {
    return {
      name: "AI size and fit guide",
      role: "Fit, measurement positions, or scale guidance without inventing exact numbers.",
      layout: "Use measurement-position diagrams and broad fit guidance only when exact size data is absent.",
      copyRule: "Readable labels only; no fake numeric size chart.",
      avoidRule: "Avoid fabricated measurements, dense spreadsheet-like layouts, and tiny text.",
    };
  }
  if (/lifestyle|scene|story|outfit|pairing|lookbook/.test(key)) {
    return {
      name: "AI lifestyle scene",
      role: "Lifestyle context, styling, pairing, or use scenario matched to the analyzed product.",
      layout: "Create a scene that fits the product category, target audience, season, and visual strategy.",
      copyRule: "One short headline and optional subtitle; no bullet wall.",
      avoidRule: "Avoid copying local preset demographics or scenes that conflict with the product analysis.",
    };
  }
  if (/selling|point|benefit/.test(key)) {
    return {
      name: "AI selling point",
      role: "Core purchase reasons grounded in visible structure, material, or use case.",
      layout: "Use one dominant product view with 3-4 concise callouts.",
      copyRule: "Short callouts only; no unsupported claims.",
      avoidRule: "Avoid repeating all selling points from every other module.",
    };
  }
  if (/trust|buyer|review|show/.test(key)) {
    return {
      name: "AI trust proof",
      role: "Trust, buyer-use atmosphere, care, quality, or confidence support.",
      layout: "Use authentic ecommerce proof style while keeping product identity central.",
      copyRule: "Use generic trust language only; do not invent reviews, ratings, certifications, or sales data.",
      avoidRule: "Avoid fabricated user comments, fake awards, fake guarantees, or platform UI.",
    };
  }
  if (/tutorial|step|how/.test(key)) {
    return {
      name: "AI usage tutorial",
      role: "Use steps, care steps, installation, styling, or operation guidance.",
      layout: "Use simple step composition with clear product states.",
      copyRule: "Up to four short step labels; no tiny paragraphs.",
      avoidRule: "Avoid fake technical claims or unsupported safety instructions.",
    };
  }
  return {
    name: imageType === "details" ? "AI detail screen" : "AI product image",
    role: imageType === "details" ? "A distinct detail-page screen from AI visual analysis." : "A distinct main/supporting product image from AI visual analysis.",
    layout: "Use product-led composition, clear hierarchy, and a layout chosen from the visual analysis rather than local presets.",
    copyRule: "Sparse readable ecommerce copy only.",
    avoidRule: "Avoid preset-template demographics, repeated layouts, and unsupported claims.",
  };
}

function resolveAiTemplateAspectRatio(moduleKey: string, imageType: ProductSetImageType): AspectRatio {
  if (imageType === "details") return "3:4";
  if (/catalog|model|wearing|lifestyle|scene|lookbook/.test(moduleKey)) return "3:4";
  return "1:1";
}

function resolveAiCopyDensity(moduleKey: string): ProductSetCopyDensity {
  if (/white|clean|catalog|model|wearing|proof/.test(moduleKey)) return "light";
  if (/size|guide|selling|tutorial|trust/.test(moduleKey)) return "standard";
  return "light";
}

function buildGlobalVisualStrategyLine(global?: ProductSetGlobalVisualStrategy) {
  if (!global) return "";
  return [
    global.corePalette ? `Core palette: ${global.corePalette}` : "",
    global.primaryColor ? `Primary color: ${global.primaryColor}` : "",
    global.secondaryColors.length ? `Secondary colors: ${global.secondaryColors.join(", ")}` : "",
    global.accentColor ? `Accent: ${global.accentColor}` : "",
    global.colorTemperature ? `Color temperature: ${global.colorTemperature}` : "",
    global.lighting ? `Lighting: ${global.lighting}` : "",
    global.typography ? `Typography: ${global.typography}` : "",
    global.textureMood ? `Texture mood: ${global.textureMood}` : "",
  ].filter(Boolean).join("; ");
}

function formatAiDirectorScript(script: ProductSetVisualDirectorScreenScript) {
  return [
    script.screenNo ? `Screen ${script.screenNo}` : "",
    script.moduleKey ? `module=${script.moduleKey}` : "",
    script.title,
    script.globalTone ? `tone=${script.globalTone}` : "",
    script.sceneDesign ? `scene=${script.sceneDesign}` : "",
    script.visualComposition ? `composition=${script.visualComposition}` : "",
    script.copyContent ? `copy=${script.copyContent}` : "",
    script.layoutRules ? `layout=${script.layoutRules}` : "",
    script.constraints ? `constraints=${script.constraints}` : "",
  ].filter(Boolean).join(" | ");
}

export function resolveProductSetTemplates(input: {
  mode: ProductSetCreationMode;
  imageType: ProductSetImageType;
  selectedTemplateIds?: number[];
  customTemplates?: ProductSetCustomTemplate[];
  genCount?: number;
  productProfile?: ProductSetProductProfile;
  settings?: ProductSetSettings;
  moduleOverrides?: ProductSetModuleOverride[];
}): ProductSetResolvedTemplate[] {
  const imageType = normalizeProductSetImageType(input.imageType);
  if (input.mode === "custom") {
    const selectedPresets = (input.selectedTemplateIds || [])
      .map((id) => getProductSetTemplate(Number(id)))
      .filter((item): item is ProductSetTemplate => Boolean(item && item.imageType === imageType))
      .map((item) => ({ ...item, source: "preset" as const }));
    const customTemplates = (input.customTemplates || [])
      .filter((item) => item.imageType === imageType && item.name.trim() && item.typeDescription.trim())
      .slice(0, 10)
      .map((item) => {
        const guidance = inferTemplateGuidance(0, item.name, item.imageType, "general");
        return {
          ...item,
          source: "custom" as const,
          moduleRole: item.moduleRole || guidance.moduleRole,
          contentScope: item.contentScope || guidance.contentScope,
          layoutRules: item.layoutRules || guidance.layoutRules,
          textRules: item.textRules || guidance.textRules,
          avoidRules: item.avoidRules || guidance.avoidRules,
          typeDescriptionV2: item.typeDescription,
          batchSize: 1,
          subjectConsistency: item.subjectConsistency ?? true,
          modelConsistency: item.modelConsistency ?? false,
          intelligentCopy: item.intelligentCopy ?? true,
          copyDensity: normalizeProductSetCopyDensity(item.copyDensity, "standard"),
          innerExtraDescription: item.extraDescription || "请严格参考用户自定义样式要求。",
          coverImage: item.referenceImageUrls?.[0] || item.otherReferenceImageUrls?.[0] || item.modelReferenceImageUrls?.[0],
          scenario: "general" as const,
        };
      });
    return applyProductSetModuleOverrides([...selectedPresets, ...customTemplates].slice(0, 10), input.moduleOverrides);
  }

  const count = Math.min(Math.max(Number(input.genCount) || (imageType === "details" ? 5 : 3), 1), imageType === "details" ? 8 : 6);
  const resolved = buildAiProductSetTemplates({
    imageType,
    count,
    productProfile: input.productProfile,
    settings: input.settings,
  });
  return applyProductSetModuleOverrides(resolved, input.moduleOverrides);
}

export function buildProductSetPlanRecommendation(input: {
  mode: ProductSetCreationMode;
  imageType: ProductSetImageType;
  templates: ProductSetResolvedTemplate[];
  productProfile?: ProductSetProductProfile;
}): ProductSetPlanRecommendation {
  const profile = normalizeProductSetProductProfile(input.productProfile);
  const primaryPlanId = input.imageType === "main" ? profile.recommendedMainPlanId : profile.recommendedDetailsPlanId;
  const riskLevel: ProductSetPlanRecommendation["riskLevel"] = profile.apparelType === "intimate" || profile.apparelType === "swimwear"
    ? "high"
    : profile.needsModel
      ? "medium"
      : "low";
  const title = profile.isApparel
    ? `${profile.displayName} ${input.imageType === "details" ? "详情页计划" : "主图计划"}`
    : `${profile.displayName} 电商套图计划`;
  const summary = [
    input.mode === "custom" ? "按已选模板生成。" : "按商品识别结果自动编排。",
    profile.needsModel ? "包含适合的模特/穿搭模块。" : "以商品主体、细节、场景和信息说明为主。",
    "每张图都有独立职责，避免重复堆卖点。",
  ].join("");

  return {
    title,
    summary,
    primaryPlanId,
    suggestedCount: input.templates.length,
    modelAdvice: profile.modelBrief,
    riskLevel,
    modules: input.templates.map((template, index) => ({
      key: getProductSetModuleKey(template, index),
      name: template.name,
      role: template.moduleRole,
      reason: getProductSetModuleReason(template, profile),
      aspectRatio: template.aspectRatio,
      usesModel: shouldUseModelForTemplate(template, profile),
    })),
  };
}

export function getProductSetReferenceUrls(template: ProductSetResolvedTemplate) {
  if (template.source === "custom") {
    return [
      ...(template.referenceImageUrls || []),
      ...(template.modelReferenceImageUrls || []),
      ...(template.otherReferenceImageUrls || []),
    ];
  }
  return template.coverImage ? [template.coverImage] : [];
}

export function buildProductSetPrompt(input: {
  productInfo?: string;
  productProfile?: ProductSetProductProfile;
  productImageCount: number;
  template: ProductSetResolvedTemplate;
  allTemplates?: ProductSetResolvedTemplate[];
  settings: ProductSetSettings;
  mode: ProductSetCreationMode;
  aspectRatio: AspectRatio;
  imageSize: string;
  sequenceIndex: number;
  totalCount: number;
}) {
  const { productInfo, productImageCount, template, settings, mode, aspectRatio, imageSize, sequenceIndex, totalCount } = input;
  const productProfile = normalizeProductSetProductProfile(input.productProfile, productInfo);
  const referenceCount = getProductSetReferenceUrls(template).length;
  const useModel = shouldUseModelForTemplate(template, productProfile);
  const stylePack = getProductSetStylePack(settings.stylePackId);
  const moduleDirectorBrief = buildProductSetModuleDirectorBrief(template, productProfile, sequenceIndex, totalCount);
  const textBudgetLine = buildProductSetTextBudgetLine(template);
  const visualDirectorScript = settings.visualDirectorScript?.trim();
  const campaignMap = (input.allTemplates || [])
    .map((item, index) => `${index + 1}. ${item.name}: ${item.moduleRole}`)
    .join("\n");
  const referenceLine = referenceCount
    ? template.source === "custom"
      ? `Custom reference images: after the ${productImageCount} product images, extra references may include style layout, model/person reference, and other visual references. Use them only for their declared role; product identity always comes from the first ${productImageCount} product images.`
      : `Style reference image: the final ${referenceCount} reference image is only for layout/style inspiration. Do not copy its product, logo, text, brand, model, or exact scene.`
    : "No external style image is provided; infer a professional ecommerce layout from the template brief.";
  const fontStyle = PRODUCT_SET_FONT_STYLE_LABELS[settings.fontStyle] || PRODUCT_SET_FONT_STYLE_LABELS.auto;
  const themeLine = settings.themeMode === "custom"
    ? `Theme colors: use the user specified theme palette "${settings.themeColor}" with accessible text contrast.`
    : "Theme colors: intelligently extract a harmonious palette from the product and target ecommerce context.";
  const stylePackLine = stylePack?.extraPrompt
    ? `${stylePack.extraPrompt} Style keywords: ${stylePack.keywords.join(", ")}.`
    : "";
  const copyLine = template.intelligentCopy
    ? "Add only the copy allowed by this module's text budget. Copy must be large, readable, natural, and not invent certifications, prices, medical claims, awards, or exact dimensions unless provided."
    : "Avoid marketing copy. If text is necessary, keep it to one tiny factual label or no text.";
  const womenswearLine = template.scenario === "womenswear"
    ? "Womenswear-specific rules: preserve garment silhouette, neckline, sleeve shape, waistline, hem, drape, fabric texture, color and pattern. Styling must feel wearable and ecommerce-ready; avoid changing the garment category or making the fit unrealistic."
    : "";
  const modelLine = useModel
    ? `Model usage: this module should include a suitable model/wearing state. Model brief: ${productProfile.modelBrief}. If a custom model reference image is supplied after the product images, use it only for model identity/pose/style consistency and keep the uploaded product as the clothing/product source.`
    : `Model usage: do not add a human model unless required by the uploaded product itself. This module should focus on product, layout, details or scene. Product profile model strategy: ${productProfile.modelStrategy}.`;
  const sensitiveLine = productProfile.apparelType === "intimate" || productProfile.apparelType === "swimwear"
    ? "Sensitive apparel safety: adult commercial catalog/lookbook only; non-erotic pose, no nudity, no transparent exposure, no minors or minor-looking people, no bedroom/sexualized setting."
    : "";

  return [
    "Create one finished ecommerce product-set image.",
    `Prompt version: ${PRODUCT_SET_PROMPT_VERSION}.`,
    `Output ${sequenceIndex + 1} of ${totalCount}. Mode: ${mode === "custom" ? "custom selected template" : "smart product set"}.`,
    `Product classification: ${productProfile.displayName}; kind=${productProfile.kind}; apparelType=${productProfile.apparelType}; isApparel=${productProfile.isApparel}; confidence=${productProfile.confidence}.`,
    productProfile.planningNotes.length ? `Planning notes: ${productProfile.planningNotes.join(" ")}` : "",
    campaignMap ? `Full product-set architecture. Each output must own a different content module:\n${campaignMap}` : "",
    visualDirectorScript ? `AI visual director execution script from product analysis:\n${visualDirectorScript}\nUse the global strategy for visual consistency, then apply only the current screen/module script that matches this output. Do not copy every screen into this one image.` : "",
    "Critical sequencing rule: do not make every image a generic selling-point poster. Each image must have a distinct purpose, composition, headline style, text density, and visual structure.",
    "Module isolation rule v4: this output must solve ONLY the current module. If the product has five selling points, choose only the one or two that belong to this module; leave the rest to sibling modules.",
    "Anti-duplication rule v4: do not reuse the same headline, bullet list, icon row, bottom detail strip, model pose, or composition used by sibling modules. Create a visibly different layout for this module.",
    "Commercial hierarchy rule v4: use one primary visual idea, one clear focal product area, and one information hierarchy. Avoid collage overload unless the module explicitly requests multi-panel details.",
    "AI visual director rule v5: behave like an ecommerce art director, not a generic poster generator. Decide camera, layout, whitespace, text weight and scene props from the current module role only.",
    "Text rendering rule v5: never rely on tiny generated paragraphs, tiny tables, unreadable small labels, or dense UI-like panels. Prefer sparse large typography and clear reserved copy areas.",
    `Template name: ${template.name}.`,
    `Current module role: ${template.moduleRole}.`,
    `Current content scope: ${template.contentScope}.`,
    `Module director brief: ${moduleDirectorBrief}`,
    `Template brief: ${template.typeDescriptionV2 || template.typeDescription}.`,
    `Template extra direction: ${template.innerExtraDescription}.`,
    `Output type: ${template.imageType === "main" ? "product item main/supporting image" : "product detail page module"}.`,
    `Aspect ratio: ${aspectRatio}. Resolution target: ${imageSize}. Template native ratio: ${template.aspectRatio}.`,
    `Layout rules for this module: ${template.layoutRules}`,
    `Text rules for this module: ${template.textRules}`,
    `Text budget for this module: ${textBudgetLine}`,
    `Avoid for this module: ${template.avoidRules}`,
    `Input product images: the first ${productImageCount} images are the same product from multiple viewpoints. Use them as the authoritative source for product shape, color, material, pattern, logo placement, details, and proportions.`,
    referenceLine,
    "Preserve product identity strictly. Do not redesign the product, change colors/materials/logos, add impossible functions, or mix in the style reference product.",
    template.subjectConsistency ? "Maintain high subject consistency across product appearance, model wearing state, perspective, and visible details." : "Maintain product identity while optimizing composition and commercial polish.",
    template.modelConsistency ? "Maintain model/person consistency if a model reference is provided; do not borrow clothing from the model reference." : "",
    modelLine,
    womenswearLine,
    sensitiveLine,
    `Target country/region: ${settings.country}. Target platform: ${settings.platform}. Text language: ${settings.language}.`,
    themeLine,
    stylePackLine,
    `Typography: ${fontStyle}. Use clean hierarchy, sufficient margins, and no overlapping text.`,
    `Copy density for this module: ${template.copyDensity || "standard"}.`,
    copyLine,
    settings.extraDescription ? `User additional requirements: ${settings.extraDescription}` : "",
    productInfo ? `Product information from user/AI analysis:\n${productInfo}` : "Product information is not provided. Infer only high-confidence visible product facts from the product images.",
    "When product information includes many selling points, select only the facts that belong to the current module. Never paste the entire product info or the same benefit list into every output.",
    "Sibling-module exclusion: if another module covers size, material, detail, scene, packaging, buyer-show, or core selling points, do not repeat that module's content here except for minimal context.",
    "Self-check before final image: product identity preserved; module role is obvious; text is readable; no unsupported claims; layout differs from other modules; no garbled or overlapping text.",
    "Composition rules: one complete, production-ready ecommerce visual; professional lighting; crisp product edges; realistic shadows; platform-ready layout; no watermark; no random UI chrome; no garbled text; no extra duplicated products unless the template explicitly calls for multi-angle or comparison layout.",
  ].filter(Boolean).join("\n");
}

function buildProductSetModuleDirectorBrief(
  template: ProductSetResolvedTemplate,
  profile: ProductSetProductProfile,
  sequenceIndex: number,
  totalCount: number
) {
  const text = `${template.id} ${template.name} ${template.moduleRole} ${template.contentScope}`.toLowerCase();
  const base = [
    `This is module ${sequenceIndex + 1}/${totalCount}; make its layout immediately distinguishable from sibling modules.`,
    "Use a single dominant visual concept, clear hierarchy, product-led palette, and production-ready ecommerce composition.",
  ];

  if (/首屏|海报|hero/.test(text)) {
    base.push(
      "Hero module: build first-screen memory with one large product/model hero, strong whitespace, one short headline and one subtitle.",
      "Do not include detail thumbnails, size guide, dense feature list, or multiple small panels."
    );
  } else if (/上身|模特|穿着|model/.test(text)) {
    base.push(
      "Model-fit module: this is wearing proof, not another hero poster. Use clean catalog or try-on framing, full/three-quarter body, natural pose, minimal background.",
      "No large headline, no bullet list, no bottom detail strip; show fit, length, drape and wearing proportion."
    );
  } else if (/面料|材质|细节|纹理|做工|close/.test(text)) {
    base.push(
      "Detail/material module: prioritize macro evidence. Use one large close-up plus 3-4 secondary close-ups; product full body may appear small only for context.",
      "No lifestyle headline, no scene storytelling, no size table, no repeated full selling-point stack."
    );
  } else if (/尺码|尺寸|试穿|size|fit/.test(text)) {
    base.push(
      "Size/fit module: use measurement-position diagram and fit guidance. If exact size data is not provided, do not fake numbers or tables.",
      "Use large readable headings, simple measurement lines, 3-4 fit tags maximum; avoid tiny dense spreadsheet layouts."
    );
  } else if (/种草|买家秀|lookbook|街拍|场景|生活|scene/.test(text)) {
    base.push(
      "Lifestyle module: show one believable real-use or social-commerce scene with a different camera angle from the hero.",
      "Use candid movement, environmental context and short natural notes; do not repeat material/size/selling-point layouts."
    );
  } else if (/搭配|胶囊|outfit|pair/.test(text)) {
    base.push(
      "Outfit-pairing module: use a clean outfit board or split layout with 2-3 matching combinations.",
      "No model hero duplication, no material macro grid, no size chart."
    );
  } else if (/卖点|痛点|对比|selling/.test(text)) {
    base.push(
      "Selling-point module: summarize only 3-4 high-confidence purchase reasons linked to visible product facts.",
      "Use product hero plus callouts; do not copy the product description or claims that are not visible/provided."
    );
  } else if (/白底|主图|多角度/.test(text)) {
    base.push(
      "Clean product module: prioritize accurate product shape, color, scale and commercial retouching.",
      "No lifestyle scene, no model unless explicitly required, no marketing paragraph."
    );
  }

  if (profile.isApparel) {
    base.push("Apparel art direction: preserve neckline, sleeve, waistline, hem, drape, fabric, color and silhouette; styling can change but garment structure cannot.");
  }

  return base.join(" ");
}

function buildProductSetTextBudgetLine(template: ProductSetResolvedTemplate) {
  const density = template.copyDensity || "standard";
  const text = `${template.name} ${template.moduleRole}`.toLowerCase();
  if (density === "none") return "No rendered text. Leave clean negative space for system overlay if needed.";
  if (/尺码|尺寸|试穿|教程|步骤/.test(text)) {
    return "Readable text only: one heading under 10 Chinese characters, up to 4 large labels, optional simple measurement labels. No dense tables and no fake exact numbers.";
  }
  if (/细节|材质|面料|纹理/.test(text)) {
    return "One small heading optional, up to 4 large factual labels. No paragraph, no repeated selling points.";
  }
  if (/首屏|海报|hero|场景|种草|lookbook|买家秀/.test(text)) {
    return "One headline under 12 Chinese characters, one subtitle under 18 Chinese characters, optional 1-2 tiny style tags. No bullets.";
  }
  if (/卖点|对比|痛点/.test(text)) {
    return "One heading and 3-4 short callouts, each under 8 Chinese characters. No paragraph.";
  }
  if (density === "light") return "Minimal text: one short label or headline only.";
  if (density === "rich") return "Information-rich but still readable: max 5 text blocks, all large enough for mobile preview.";
  return "Standard sparse ecommerce text: one headline plus up to 3 short labels.";
}

export function shouldUseModelForTemplate(template: ProductSetResolvedTemplate, productProfile?: ProductSetProductProfile) {
  const profile = normalizeProductSetProductProfile(productProfile);
  if (!profile.isApparel && profile.kind !== "footwear" && profile.kind !== "accessory") return false;
  if (profile.modelStrategy === "none") return false;
  const text = `${template.name} ${template.moduleRole} ${template.typeDescriptionV2} ${template.contentScope}`.toLowerCase();
  if (/模特|上身|穿着|穿搭|街拍|lookbook|买家秀|种草|试穿|通勤|场景/.test(text)) return true;
  if (/lookbook|model|wearing|proof|fit|outfit|catalog|lifestyle|pairing/.test(text)) return true;
  if (template.modelConsistency) return true;
  return profile.modelStrategy === "required" && !/白底|尺寸|尺码|结构|材质|细节|包装|安装|教程/.test(text);
}

export function getProductSetModuleQualityLabel(score?: number) {
  if (typeof score !== "number") return { label: "待评分", tone: "neutral" as const };
  if (score >= 0.86) return { label: "优秀", tone: "good" as const };
  if (score >= 0.72) return { label: "可用", tone: "ok" as const };
  return { label: "建议重生", tone: "warn" as const };
}

function inferRecommendedPlanId(
  imageType: ProductSetImageType,
  profile: Pick<ProductSetProductProfile, "kind" | "apparelType" | "isApparel" | "needsModel">
) {
  if (profile.isApparel || profile.kind === "footwear") {
    return imageType === "main" ? "women-main" : "women-detail";
  }
  return imageType === "main" ? "taobao-main" : "details-basic";
}

function buildDefaultModelBrief(apparelType: ProductSetApparelType, footwear: boolean) {
  if (footwear) return "使用成年模特脚穿或半身生活场景，突出上脚比例、舒适感和搭配，不需要完整正脸。";
  if (apparelType === "womenswear") return "使用成年女性模特，姿势自然，适配通勤、休闲、街拍或小红书场景，突出版型、垂感和搭配。";
  if (apparelType === "menswear") return "使用成年男性模特，姿势自然，适配商务、户外、街头或运动场景，突出版型和功能感。";
  if (apparelType === "kidswear") return "使用年龄合适的儿童模特，姿势活泼但不过度成人化，场景明亮安全。";
  if (apparelType === "outerwear") return "使用成年模特，加入站立、行走、侧身或户外通勤动作，突出外套版型、防护感和层次。";
  if (apparelType === "sportswear") return "使用成年运动模特，姿势自然有动势，突出弹性、舒适和功能场景。";
  return "使用成年模特，按商品风格匹配性别、年龄段和场景，突出穿着效果和真实版型。";
}

function normalizeProductKind(value: unknown, fallback: ProductSetProductKind): ProductSetProductKind {
  return value === "apparel" || value === "footwear" || value === "bag" || value === "accessory" || value === "beauty" || value === "electronics" || value === "home" || value === "toy" || value === "food" || value === "general"
    ? value
    : fallback;
}

function normalizeApparelType(value: unknown, fallback: ProductSetApparelType): ProductSetApparelType {
  return value === "womenswear" || value === "menswear" || value === "kidswear" || value === "intimate" || value === "swimwear" || value === "sportswear" || value === "outerwear" || value === "general"
    ? value
    : fallback;
}

function normalizeModelStrategy(value: unknown, fallback: ProductSetModelStrategy): ProductSetModelStrategy {
  return value === "none" || value === "optional" || value === "recommended" || value === "required" ? value : fallback;
}

function normalizeProductSetAspectRatio(value: unknown): AspectRatio | undefined {
  return value === "4:3" || value === "3:4" || value === "9:16" || value === "16:9" || value === "1:1" || value === "3:2" || value === "2:3" || value === "21:9"
    ? value
    : undefined;
}

function normalizeOptionalProductSetCopyDensity(value: unknown): ProductSetCopyDensity | undefined {
  return value === "none" || value === "light" || value === "standard" || value === "rich" ? value : undefined;
}

function normalizeProductSetGlobalVisualStrategy(value: unknown): ProductSetGlobalVisualStrategy {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    corePalette: readDirectorText(input, "corePalette", "core_palette", 100),
    primaryColor: readDirectorText(input, "primaryColor", "primary_color", 100),
    secondaryColors: normalizeStringArray(input.secondaryColors || input.secondary_colors, [], 6, 80),
    accentColor: readDirectorText(input, "accentColor", "accent_color", 100),
    colorTemperature: readDirectorText(input, "colorTemperature", "color_temperature", 100),
    lighting: readDirectorText(input, "lighting", "lighting", 180),
    typography: readDirectorText(input, "typography", "typography", 140),
    textureMood: readDirectorText(input, "textureMood", "texture_mood", 180),
  };
}

function normalizeProductSetDirectorModules(value: unknown, maxItems: number): ProductSetVisualDirectorModule[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item): ProductSetVisualDirectorModule | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as Record<string, unknown>;
      const moduleKey = readDirectorText(input, "moduleKey", "module_key", 80);
      if (!moduleKey) return null;
      return {
        moduleKey,
        purpose: readDirectorText(input, "purpose", "purpose", 180),
        layout: readDirectorText(input, "layout", "layout", 260),
        copyRule: readDirectorText(input, "copyRule", "copy_rule", 180),
      };
    })
    .filter((item): item is ProductSetVisualDirectorModule => Boolean(item))
    .slice(0, maxItems);
}

function normalizeProductSetDirectorScripts(value: unknown, maxItems: number): ProductSetVisualDirectorScreenScript[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item): ProductSetVisualDirectorScreenScript | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as Record<string, unknown>;
      const moduleKey = readDirectorText(input, "moduleKey", "module_key", 80);
      const title = readDirectorText(input, "title", "title", 100);
      if (!moduleKey && !title) return null;
      return {
        screenNo: normalizeOptionalPositiveInteger(input.screenNo || input.screen_no, 20),
        moduleKey,
        title,
        globalTone: readDirectorText(input, "globalTone", "global_tone", 220),
        sceneDesign: readDirectorText(input, "sceneDesign", "scene_design", 420),
        visualComposition: readDirectorText(input, "visualComposition", "visual_composition", 340),
        copyContent: readDirectorText(input, "copyContent", "copy_content", 260),
        layoutRules: readDirectorText(input, "layoutRules", "layout_rules", 280),
        constraints: readDirectorText(input, "constraints", "constraints", 280),
      };
    })
    .filter((item): item is ProductSetVisualDirectorScreenScript => Boolean(item))
    .slice(0, maxItems);
}

function readDirectorText(input: Record<string, unknown>, camelKey: string, snakeKey: string, maxLength: number) {
  return safeText(input[camelKey] ?? input[snakeKey], "", maxLength);
}

function normalizeProductSetModuleStatus(value: unknown): ProductSetModuleStatus {
  return value === "running" || value === "completed" || value === "failed" ? value : "queued";
}

function normalizeStringArray(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function clampConfidence(value: unknown, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Number(number.toFixed(2)), 0), 1);
}

function clampPercent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(Math.round(number), 0), 100);
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function normalizeOptionalPositiveInteger(value: unknown, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.min(Math.floor(number), max);
}

function normalizeOptionalDuration(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(Math.round(number), 3_600_000);
}

function normalizeOptionalScore(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(Math.max(Number(number.toFixed(3)), 0), 1);
}

function safeText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function safeOptionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}
