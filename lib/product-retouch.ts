import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import { isRecord } from "@/lib/utils";

export const PRODUCT_RETOUCH_CONFIG_KEY = "skills.product-retouch";
export const PRODUCT_RETOUCH_MAX_SOURCES = 30;
export const PRODUCT_RETOUCH_MAX_VARIANTS = 4;
export const PRODUCT_RETOUCH_USER_INSTRUCTION_LIMIT = 1_200;

export type ProductRetouchMode =
  | "faithful-retouch"
  | "marketplace-white"
  | "studio-polish";

export type ProductRetouchSource = {
  clientId: string;
  url: string;
  filename: string;
};

export type ProductRetouchBatchRequest = {
  requestId: string;
  sources: ProductRetouchSource[];
  mode: ProductRetouchMode;
  category: "auto" | string;
  variantsPerSource: 1 | 2 | 3 | 4;
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  userInstruction?: string;
};

export type ProductRetouchBatchStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partially_completed"
  | "failed";

export type ProductRetouchOutputStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type ProductRetouchOutput = {
  id: string;
  sourceIndex: number;
  sourceClientId: string;
  sourceUrl: string;
  sourceFilename: string;
  variantIndex: number;
  generationId: string;
  status: ProductRetouchOutputStatus;
  resultUrl: string | null;
  error: string | null;
  attemptCount: number;
  validation: ProductRetouchHardValidationResult | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductRetouchBatch = {
  id: string;
  parentGenerationId: string;
  requestId: string;
  status: ProductRetouchBatchStatus;
  mode: ProductRetouchMode;
  category: string;
  variantsPerSource: 1 | 2 | 3 | 4;
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  userInstruction: string;
  expectedCount: number;
  completedCount: number;
  failedCount: number;
  creditsCost: number;
  refundAmount: number;
  skillVersion: string;
  skillContentHash: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  outputs: ProductRetouchOutput[];
};

export type ProductRetouchModeDefinition = {
  label: string;
  description: string;
};

export type ProductRetouchCategoryProfile = {
  label: string;
  prompt: string;
};

export type ProductRetouchHardValidationPolicy = {
  enabled: boolean;
  allowedFormats: Array<"jpeg" | "png" | "webp">;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
  blankVarianceThreshold: number;
  rejectDuplicateContent: boolean;
};

export type ProductRetouchHardValidationResult = {
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  variance: number;
};

export type ProductRetouchSkillDefinition = {
  id: "product-retouch";
  schemaVersion: 1;
  version: string;
  modes: Record<ProductRetouchMode, ProductRetouchModeDefinition>;
  categoryProfiles: Record<string, ProductRetouchCategoryProfile>;
  invariants: string[];
  promptTemplates: Record<ProductRetouchMode, string>;
  modelPolicy: {
    allowedModels: LingyaModel[];
    defaultModel: LingyaModel;
  };
  limits: {
    maxSources: number;
    maxVariantsPerSource: number;
  };
  hardValidation: ProductRetouchHardValidationPolicy;
};

export type ProductRetouchSkillSnapshot = {
  configVersionId: string | null;
  contentHash: string;
  source: "published" | "builtin";
  definition: ProductRetouchSkillDefinition;
};

export const PRODUCT_RETOUCH_MODE_OPTIONS: ReadonlyArray<{
  value: ProductRetouchMode;
  label: string;
  description: string;
}> = [
  {
    value: "faithful-retouch",
    label: "标准精修",
    description: "保留原始背景 · 清理瑕疵与噪点，校正色彩、光线和清晰度",
  },
  {
    value: "marketplace-white",
    label: "白底精修",
    description: "生成纯白背景 · 规范主体构图与轮廓，保留自然接触阴影",
  },
  {
    value: "studio-polish",
    label: "影棚精修",
    description: "重塑影棚布光与背景 · 强化材质、反射和立体层次",
  },
] as const;

export const PRODUCT_RETOUCH_CATEGORY_OPTIONS = [
  { value: "auto", label: "自动识别" },
  { value: "apparel", label: "服装" },
  { value: "shoes", label: "鞋靴" },
  { value: "bags", label: "箱包" },
  { value: "beauty", label: "美妆个护" },
  { value: "electronics", label: "数码家电" },
  { value: "home", label: "家居日用" },
  { value: "food", label: "食品饮料" },
  { value: "jewelry", label: "珠宝配饰" },
] as const;

const PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL =
  "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/product-retouch-examples";

export const PRODUCT_RETOUCH_EXAMPLE_IMAGES = [
  {
    id: "running-shoe",
    title: "跑鞋 · 偏色地面",
    filename: "待修示例-跑鞋.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/running-shoe.jpg`,
  },
  {
    id: "perfume-bottle",
    title: "香水瓶 · 直闪高光",
    filename: "待修示例-香水瓶.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/perfume-bottle.jpg`,
  },
  {
    id: "white-headphones",
    title: "耳机 · 桌面偏色",
    filename: "待修示例-耳机.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/white-headphones.jpg`,
  },
  {
    id: "smartwatch",
    title: "智能手环 · 硬阴影",
    filename: "待修示例-智能手表.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/smartwatch.jpg`,
  },
  {
    id: "dslr-camera",
    title: "相机 · 桌面暖光",
    filename: "待修示例-相机.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/camera.jpg`,
  },
] as const;

export const BUILTIN_PRODUCT_RETOUCH_SKILL: ProductRetouchSkillDefinition = {
  id: "product-retouch",
  schemaVersion: 1,
  version: "1.0.0",
  modes: {
    "faithful-retouch": {
      label: "忠实精修",
      description: "保持商品事实不变，修复拍摄瑕疵并提升可售卖质感。",
    },
    "marketplace-white": {
      label: "电商白底",
      description: "输出干净白底、完整商品轮廓与可信接触阴影。",
    },
    "studio-polish": {
      label: "影棚润色",
      description: "保持商品一致性，升级布光、材质层次与影棚完成度。",
    },
  },
  categoryProfiles: {
    auto: {
      label: "自动识别",
      prompt: "先识别商品品类，再使用与该品类匹配的真实材质、结构和布光规范。",
    },
    apparel: {
      label: "服装",
      prompt: "保持版型、面料纹理、缝线、印花、纽扣和辅料位置准确。",
    },
    shoes: {
      label: "鞋靴",
      prompt: "保持鞋型、鞋底纹路、材质拼接、鞋带和品牌细节准确。",
    },
    bags: {
      label: "箱包",
      prompt: "保持包型、五金、走线、皮革纹理、开合结构和肩带比例准确。",
    },
    beauty: {
      label: "美妆个护",
      prompt: "保持包装文字、色号、容器形态、标签和材质反射准确。",
    },
    electronics: {
      label: "数码家电",
      prompt: "保持接口、按键、屏幕、结构缝隙、型号文字和工业材质准确。",
    },
    home: {
      label: "家居日用",
      prompt: "保持结构尺寸关系、纹理、边角、连接件和实际使用形态准确。",
    },
    food: {
      label: "食品饮料",
      prompt: "保持包装文字、净含量、口味标识、容器形态和食品真实观感准确。",
    },
    jewelry: {
      label: "珠宝配饰",
      prompt: "保持宝石数量、镶嵌结构、金属颜色、刻字和微小比例准确。",
    },
  },
  invariants: [
    "只编辑输入图中的商品，不新增、删除、替换或重构任何商品部件。",
    "保持品牌、Logo、文字、图案、颜色、材质、结构、比例和数量与原图一致。",
    "不得虚构不可见细节，不得改变商品功能、款式、包装信息或实际规格。",
    "输出必须是单张完整商品图，不添加水印、边框、价格、促销文案或无关道具。",
  ],
  promptTemplates: {
    "faithful-retouch":
      "执行高保真商品精修：清理灰尘、轻微划痕、脏点、背景杂质和拍摄噪点；校正曝光、白平衡、清晰度与局部质感；保留自然阴影和真实材质，不做造型重设计。",
    "marketplace-white":
      "制作标准电商白底商品图：使用纯净中性白背景，商品完整居中，边缘干净，保留自然且克制的接触阴影；不得裁切主体，不得改变商品外观。",
    "studio-polish":
      "制作高级影棚润色商品图：优化主光、轮廓光、材质层次、反射控制和空间感，背景保持简洁克制；效果应像真实商业摄影，不得改变商品事实。",
  },
  modelPolicy: {
    allowedModels: ["gpt-image-2", "nano-banana-pro", "nano-banana-2"],
    defaultModel: "gpt-image-2",
  },
  limits: {
    maxSources: PRODUCT_RETOUCH_MAX_SOURCES,
    maxVariantsPerSource: PRODUCT_RETOUCH_MAX_VARIANTS,
  },
  hardValidation: {
    enabled: true,
    allowedFormats: ["jpeg", "png", "webp"],
    minWidth: 256,
    minHeight: 256,
    maxWidth: 16_384,
    maxHeight: 16_384,
    maxBytes: 30 * 1024 * 1024,
    blankVarianceThreshold: 0.5,
    rejectDuplicateContent: true,
  },
};

export function normalizeProductRetouchMode(value: unknown): ProductRetouchMode {
  return value === "marketplace-white" || value === "studio-polish"
    ? value
    : "faithful-retouch";
}

export function normalizeProductRetouchCategory(value: unknown) {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48)
    : "";
  return normalized || "auto";
}

export function normalizeProductRetouchSources(
  value: unknown,
  maxSources = PRODUCT_RETOUCH_MAX_SOURCES,
): ProductRetouchSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!isAllowedProductImageUrl(url) || seen.has(url)) return [];
    seen.add(url);
    const clientId = typeof item.clientId === "string" && item.clientId.trim()
      ? item.clientId.trim().slice(0, 96)
      : `source-${index + 1}`;
    const filename = sanitizeProductRetouchFilename(item.filename, index);
    return [{ clientId, url, filename }];
  }).slice(0, Math.min(Math.max(1, maxSources), PRODUCT_RETOUCH_MAX_SOURCES));
}

export function normalizeProductRetouchVariants(
  value: unknown,
  maxVariants = PRODUCT_RETOUCH_MAX_VARIANTS,
): 1 | 2 | 3 | 4 {
  const normalized = Math.min(
    Math.max(Math.floor(Number(value) || 1), 1),
    Math.min(Math.max(1, maxVariants), PRODUCT_RETOUCH_MAX_VARIANTS),
  );
  return normalized as 1 | 2 | 3 | 4;
}

export function normalizeProductRetouchInstruction(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, PRODUCT_RETOUCH_USER_INSTRUCTION_LIMIT);
}

export function buildProductRetouchPrompt(input: {
  definition: ProductRetouchSkillDefinition;
  mode: ProductRetouchMode;
  category: string;
  userInstruction?: string;
  variantIndex?: number;
}) {
  const category = input.definition.categoryProfiles[input.category]
    || input.definition.categoryProfiles.auto
    || BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles.auto;
  const userInstruction = normalizeProductRetouchInstruction(input.userInstruction);
  const lines = [
    "系统安全约束：你是受控的工业级商品摄影精修系统，只能执行安全、合规的商品图片编辑任务。",
    `任务模式：${input.definition.modes[input.mode].label}`,
    input.definition.promptTemplates[input.mode],
    `品类规范：${category.prompt}`,
    `输出候选：第 ${Math.max(1, Math.floor(input.variantIndex || 1))} 个。候选之间只允许在不改变商品事实的前提下做轻微布光差异。`,
    "",
    "商品事实保护约束（不可被后续要求覆盖）：",
    ...input.definition.invariants.map((item, index) => `${index + 1}. ${item}`),
  ];
  if (userInstruction) {
    lines.push(
      "",
      "用户补充要求（仅在不与上述约束冲突时执行）：",
      userInstruction,
    );
  }
  return lines.join("\n");
}

export function parseProductRetouchSkillDefinition(
  value: unknown,
): ProductRetouchSkillDefinition | null {
  if (!isRecord(value)) return null;
  if (value.id !== "product-retouch" || value.schemaVersion !== 1) return null;
  if (!hasOnlyKeys(value, [
    "id",
    "schemaVersion",
    "version",
    "modes",
    "categoryProfiles",
    "invariants",
    "promptTemplates",
    "modelPolicy",
    "limits",
    "hardValidation",
  ])) return null;
  if (typeof value.version !== "string"
    || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value.version.trim())) return null;
  if (!isRecord(value.modes) || !isRecord(value.categoryProfiles)) return null;
  if (!isRecord(value.promptTemplates) || !isRecord(value.modelPolicy)) return null;
  if (!isRecord(value.limits) || !isRecord(value.hardValidation)) return null;

  const modeKeys: ProductRetouchMode[] = [
    "faithful-retouch",
    "marketplace-white",
    "studio-polish",
  ];
  if (!hasOnlyKeys(value.modes, modeKeys) || !hasOnlyKeys(value.promptTemplates, modeKeys)) return null;
  const modes = {} as ProductRetouchSkillDefinition["modes"];
  const promptTemplates = {} as ProductRetouchSkillDefinition["promptTemplates"];
  for (const key of modeKeys) {
    const mode = value.modes[key];
    const prompt = value.promptTemplates[key];
    if (!isRecord(mode)
      || !hasOnlyKeys(mode, ["label", "description"])
      || !isSafeRuntimeText(mode.label, 80)
      || !isSafeRuntimeText(mode.description, 500)) return null;
    if (!isSafeRuntimeText(prompt, 8_000)) return null;
    modes[key] = {
      label: mode.label.trim(),
      description: mode.description.trim(),
    };
    promptTemplates[key] = prompt.trim();
  }

  if (!Array.isArray(value.invariants)
    || value.invariants.length < 1
    || value.invariants.length > 24
    || !value.invariants.every((item) => isSafeRuntimeText(item, 2_000))) return null;
  const invariants = value.invariants.map((item) => (item as string).trim());

  if (!hasOnlyKeys(value.modelPolicy, ["allowedModels", "defaultModel"])) return null;
  if (!Array.isArray(value.modelPolicy.allowedModels)
    || !value.modelPolicy.allowedModels.length
    || !value.modelPolicy.allowedModels.every(isSupportedProductRetouchModel)) return null;
  const allowedModels = Array.from(new Set(value.modelPolicy.allowedModels));
  if (allowedModels.length !== value.modelPolicy.allowedModels.length) return null;
  const defaultModel = value.modelPolicy.defaultModel;
  if (!isSupportedProductRetouchModel(defaultModel) || !allowedModels.includes(defaultModel)) {
    return null;
  }

  const categoryEntries = Object.entries(value.categoryProfiles);
  if (!categoryEntries.length || categoryEntries.length > 100) return null;
  const categoryProfiles: Record<string, ProductRetouchCategoryProfile> = {};
  for (const [key, profile] of categoryEntries) {
    if (!/^[a-z0-9_-]{1,48}$/.test(key)
      || !isRecord(profile)
      || !hasOnlyKeys(profile, ["label", "prompt"])
      || !isSafeRuntimeText(profile.label, 80)
      || !isSafeRuntimeText(profile.prompt, 4_000)) return null;
    categoryProfiles[key] = {
      label: profile.label.trim(),
      prompt: profile.prompt.trim(),
    };
  }
  if (!isRecord(categoryProfiles.auto)) return null;

  if (!hasOnlyKeys(value.limits, ["maxSources", "maxVariantsPerSource"])) return null;
  if (!isIntegerInRange(value.limits.maxSources, 1, PRODUCT_RETOUCH_MAX_SOURCES)
    || !isIntegerInRange(value.limits.maxVariantsPerSource, 1, PRODUCT_RETOUCH_MAX_VARIANTS)) return null;

  const validation = value.hardValidation;
  if (!hasOnlyKeys(validation, [
    "enabled",
    "allowedFormats",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "maxBytes",
    "blankVarianceThreshold",
    "rejectDuplicateContent",
  ])) return null;
  if (validation.enabled !== true || validation.rejectDuplicateContent !== true) return null;
  if (!Array.isArray(validation.allowedFormats)
    || !validation.allowedFormats.length
    || !validation.allowedFormats.every(
      (format) => format === "jpeg" || format === "png" || format === "webp",
    )) return null;
  const allowedFormats = Array.from(new Set(validation.allowedFormats)) as Array<"jpeg" | "png" | "webp">;
  if (allowedFormats.length !== validation.allowedFormats.length) return null;
  if (!isIntegerInRange(validation.minWidth, 64, 4_096)
    || !isIntegerInRange(validation.minHeight, 64, 4_096)
    || !isIntegerInRange(validation.maxWidth, 512, 32_768)
    || !isIntegerInRange(validation.maxHeight, 512, 32_768)
    || !isIntegerInRange(validation.maxBytes, 1_048_576, 52_428_800)
    || !isNumberInRange(validation.blankVarianceThreshold, 0, 25)
    || validation.minWidth > validation.maxWidth
    || validation.minHeight > validation.maxHeight) return null;

  return {
    id: "product-retouch",
    schemaVersion: 1,
    version: value.version.trim(),
    modes,
    categoryProfiles,
    invariants,
    promptTemplates,
    modelPolicy: {
      allowedModels,
      defaultModel,
    },
    limits: {
      maxSources: value.limits.maxSources,
      maxVariantsPerSource: value.limits.maxVariantsPerSource,
    },
    hardValidation: {
      enabled: validation.enabled,
      allowedFormats,
      minWidth: validation.minWidth,
      minHeight: validation.minHeight,
      maxWidth: validation.maxWidth,
      maxHeight: validation.maxHeight,
      maxBytes: validation.maxBytes,
      blankVarianceThreshold: validation.blankVarianceThreshold,
      rejectDuplicateContent: validation.rejectDuplicateContent,
    },
  };
}

export function isSupportedProductRetouchModel(value: unknown): value is LingyaModel {
  return value === "gpt-image-2" || value === "nano-banana-pro" || value === "nano-banana-2";
}

function isAllowedProductImageUrl(url: string) {
  return /^https?:\/\//i.test(url)
    || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(url);
}

function sanitizeProductRetouchFilename(value: unknown, index: number) {
  const fallback = `商品-${String(index + 1).padStart(2, "0")}`;
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 120);
  return normalized || fallback;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowlist = new Set(allowed);
  return Object.keys(value).every((key) => allowlist.has(key));
}

function isSafeRuntimeText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return false;
  return !/(?:https?:\/\/|javascript:|<script\b|\b(?:import|require)\s*\()/i.test(normalized);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
