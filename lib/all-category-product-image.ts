import type { ProductSetImageType } from "@/lib/product-set";

export type AllCategoryProductImagePlatform =
  | "智能匹配"
  | "淘宝"
  | "天猫"
  | "拼多多"
  | "京东"
  | "抖音"
  | "亚马逊"
  | "TEMU"
  | "eBay"
  | "SHEIN"
  | "Shopee"
  | "Lazada"
  | "TikTok";

export type AllCategoryProductImageLanguage =
  | "无文字(纯视觉)"
  | "中文(简体)"
  | "中文(繁体)"
  | "英语"
  | "日语"
  | "韩语"
  | "德语"
  | "法语"
  | "意大利语"
  | "阿拉伯语"
  | "俄语"
  | "泰语"
  | "印尼语";

export type AllCategoryProductInfoSummary = {
  raw: string;
  productName: string;
  category: string;
  sellingPoints: string[];
  painPoints: string[];
  audience: string[];
  parameters: string[];
  details: string[];
  userNeed: string;
};

export type AllCategoryProposalInput = {
  imageType: ProductSetImageType;
  productInfo?: string;
  analysis?: string;
  platform?: AllCategoryProductImagePlatform | string;
  language?: AllCategoryProductImageLanguage | string;
};

export type AllCategoryImagePlanItem = {
  id: string;
  title: string;
  description: string;
  detailPrompt: string;
};

export const ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS: AllCategoryProductImagePlatform[] = [
  "智能匹配",
  "淘宝",
  "天猫",
  "拼多多",
  "京东",
  "抖音",
  "亚马逊",
  "TEMU",
  "eBay",
  "SHEIN",
  "Shopee",
  "Lazada",
  "TikTok",
];

export const ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES: AllCategoryProductImageLanguage[] = [
  "无文字(纯视觉)",
  "中文(简体)",
  "中文(繁体)",
  "英语",
  "日语",
  "韩语",
  "德语",
  "法语",
  "意大利语",
  "阿拉伯语",
  "俄语",
  "泰语",
  "印尼语",
];

export const DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM = ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS[0];
export const DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE = ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES[0];

const EMPTY_FALLBACK = "未提供，依据商品图与分析结果提取高置信信息。";

export function parseAllCategoryProductInfo(productInfo?: string): AllCategoryProductInfoSummary {
  const raw = normalizeText(productInfo);
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const productName =
    findFieldValue(lines, ["商品名称", "产品名称", "品名", "名称", "product name"]) ||
    lines.find((line) => line.length <= 40 && !looksLikeListItem(line)) ||
    "待识别商品";

  return {
    raw,
    productName,
    category: findFieldValue(lines, ["类目", "品类", "分类", "category"]) || "全品类商品",
    sellingPoints: collectFieldValues(lines, ["卖点", "亮点", "优势", "selling point", "features"], ["高颜值呈现", "清晰展示核心功能", "适合电商转化"]),
    painPoints: collectFieldValues(lines, ["痛点", "问题", "顾虑", "pain point"], ["担心实物细节不清楚", "担心材质和规格无法判断", "担心购买场景不匹配"]),
    audience: collectFieldValues(lines, ["适用人群", "目标人群", "用户", "audience"], ["对品质细节敏感的电商消费者", "需要快速判断商品价值的浏览用户"]),
    parameters: collectFieldValues(lines, ["参数", "规格", "尺寸", "材质", "parameter", "spec"], ["尺寸、材质、颜色、功能以用户原文和商品图为准"]),
    details: collectFieldValues(lines, ["细节", "工艺", "特点", "detail"], ["结构、材质、纹理、接口、配件或包装细节需清晰呈现"]),
    userNeed: findFieldValue(lines, ["需求", "要求", "用户需求", "备注", "need"]) || raw || EMPTY_FALLBACK,
  };
}

export function generateAllCategoryAiWritingPlans(input: AllCategoryProposalInput): string[] {
  const imageType = input.imageType;
  const info = parseAllCategoryProductInfo(input.productInfo);
  const platform = normalizeOption(input.platform, DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM);
  const language = normalizeOption(input.language, DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE);
  const analysis = normalizeText(input.analysis) || `${imageType === "main" ? "主图" : "详情页"}分析结果待补充，使用商品信息生成可执行方案。`;
  const resultTitle = imageType === "main" ? "主图分析结果" : "详情页分析结果";
  const keySectionTitle = imageType === "main" ? "关键细节" : "整组图统一场景";
  const styles = imageType === "main" ? MAIN_STYLE_PLANS : DETAILS_STYLE_PLANS;

  return styles.map((style, index) => [
    `## 方案 ${index + 1}｜${resultTitle}`,
    "",
    `### 目标平台`,
    platform,
    "",
    `### 风格名称`,
    style.name,
    "",
    `### 视觉风格`,
    style.visual,
    "",
    `### 产品信息`,
    formatList([`商品：${info.productName}`, `品类：${info.category}`, ...info.sellingPoints.slice(0, 3)]),
    "",
    `### 用户痛点`,
    formatList(info.painPoints.slice(0, 4)),
    "",
    `### 适用人群`,
    formatList(info.audience.slice(0, 4)),
    "",
    `### 产品参数`,
    formatList(info.parameters.slice(0, 5)),
    "",
    `### ${keySectionTitle}`,
    imageType === "main"
      ? formatList(info.details.slice(0, 4))
      : style.scene,
    "",
    `### 设计风格`,
    style.design,
    "",
    `### 主题配色`,
    style.palette,
    "",
    `### 语言策略`,
    language === "无文字(纯视觉)" ? "不生成可读文字，以构图、道具、色彩和细节引导理解。" : `使用${language}，文案短句化，避免小字密集堆叠。`,
    "",
    `### 分析依据`,
    analysis,
    "",
    `### 用户需求原文`,
    info.userNeed,
  ].join("\n"));
}

export function generateAllCategoryDesignSpecMarkdown(input: AllCategoryProposalInput): string {
  const info = parseAllCategoryProductInfo(input.productInfo);
  const platform = normalizeOption(input.platform, DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM);
  const language = normalizeOption(input.language, DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE);

  return [
    "## 整体设计规范",
    "",
    "### 产品一致性约束",
    "严格还原参考图中产品所有细节，包括外形轮廓、比例、颜色、材质、纹理、图案、Logo、接口、纽扣、拉链、缝线、包装和配件。不得擅自改款、换色、增删结构、夸大功能或生成参考图不存在的卖点。",
    "",
    "### 视觉风格",
    `围绕${info.productName}建立统一商业视觉，适配${platform}的商品图浏览节奏；主图优先清晰识别，详情页优先解释价值、细节和使用场景。`,
    "",
    "### 色彩系统",
    "从商品主色提取主色，搭配 1 个中性色背景和 1 个强调色；保持全组图片色温一致，避免过饱和、脏灰、偏色或与商品本色冲突。",
    "",
    "### 字体系统",
    language === "无文字(纯视觉)"
      ? "默认不出现可读文字；如平台必须保留标签，仅使用极少量大字号占位式标签。"
      : `使用${language}短文案，标题、标签、参数三层层级清晰；字号适合移动端预览，不使用密集小字和难识别装饰字体。`,
    "",
    "### 视觉语言",
    "使用真实电商摄影感、干净布光、清晰边缘、自然阴影和可理解的场景道具；同一组图保持构图节奏统一，但每张图承担不同信息任务。",
    "",
    "### 品质要求",
    "画面需达到可直接上架的完成度：主体无畸变、无多余肢体或配件、无乱码、无水印、无文字重叠、无低清模糊；所有参数、功效和认证只允许来自用户原文或高置信分析。",
  ].join("\n");
}

export function createAllCategoryImagePlan(imageType: ProductSetImageType, count?: number): AllCategoryImagePlanItem[] {
  const defaults = imageType === "main" ? DEFAULT_MAIN_IMAGE_PLAN : DEFAULT_DETAILS_IMAGE_PLAN;
  const targetCount = typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : defaults.length;

  return Array.from({ length: targetCount }, (_, index) => {
    const preset = defaults[index] || buildExtraPlanItem(imageType, index + 1);
    return {
      id: `${imageType}-${index + 1}`,
      title: preset.title,
      description: preset.description,
      detailPrompt: preset.detailPrompt,
    };
  });
}

const MAIN_STYLE_PLANS = [
  {
    name: "平台转化主视觉",
    visual: "单商品或核心组合占据主焦点，背景干净，光影突出体积和质感，适合作为首张主图。",
    design: "大主体、少元素、高识别度；保留安全留白，避免复杂贴纸和过多卖点堆叠。",
    palette: "商品主色 + 明亮中性色 + 少量平台转化强调色。",
    scene: "",
  },
  {
    name: "细节信任增强",
    visual: "主体搭配局部细节放大或轻量标注，让用户快速看到材质、结构、功能和做工。",
    design: "主图仍保持电商货架感，局部 callout 不遮挡产品关键轮廓。",
    palette: "低饱和背景 + 深色文字/线条 + 与产品呼应的强调色。",
    scene: "",
  },
  {
    name: "场景价值种草",
    visual: "把商品放入真实使用场景，强调使用后状态、搭配效果或生活方式价值。",
    design: "场景真实克制，主体清晰完整，商业氛围强但不牺牲产品准确度。",
    palette: "场景自然色 + 商品主色 + 柔和高光色。",
    scene: "",
  },
] as const;

const DETAILS_STYLE_PLANS = [
  {
    name: "详情页叙事套图",
    visual: "从封面、价值解释、细节证明到规格参考形成完整购买路径。",
    design: "统一栅格、统一标题层级、统一留白节奏，每屏只讲一个重点。",
    palette: "品牌主色 + 浅背景 + 功能信息强调色。",
    scene: "整组图统一使用同一光源、同一色温和同一背景材质，封面建立氛围，后续图片延展细节、版型、参数和使用场景。",
  },
  {
    name: "专业参数说明",
    visual: "强调材质、结构、尺寸、功能、适用范围，适合决策成本较高的商品。",
    design: "图文信息清楚分区，参数不造假，缺失数据用视觉示意替代精确数值。",
    palette: "白/浅灰信息底 + 商品主色 + 科技或专业感强调色。",
    scene: "整组图统一采用说明书式清晰构图，产品照片、局部特写、规格示意保持比例和色彩一致。",
  },
  {
    name: "生活方式转化",
    visual: "用使用场景、适用人群和体验收益串联详情页，让用户理解为什么需要它。",
    design: "场景图与细节图交替出现，既有情绪价值，也有购买证据。",
    palette: "自然场景色 + 温和中性色 + 小面积转化强调色。",
    scene: "整组图统一在同一生活方式语境中展开，包含主视觉、局部体验、使用过程和结果展示。",
  },
] as const;

const DEFAULT_MAIN_IMAGE_PLAN: Omit<AllCategoryImagePlanItem, "id">[] = [
  {
    title: "首图商品主视觉",
    description: "展示商品完整外观与核心卖点，适合平台列表页快速识别。",
    detailPrompt: "严格保持参考图商品外观，使用干净背景、真实光影和高识别主体构图，突出商品轮廓、颜色、材质和第一购买理由。",
  },
  {
    title: "核心卖点强化图",
    description: "围绕 2-3 个高置信卖点进行视觉解释，降低用户理解成本。",
    detailPrompt: "以商品为中心加入局部放大、简短标签或场景道具，说明功能、材质、结构或使用效果；不编造未提供参数。",
  },
  {
    title: "场景氛围转化图",
    description: "呈现商品在真实使用环境中的价值与适用人群。",
    detailPrompt: "构建与目标平台匹配的真实场景，商品保持清晰完整，场景只服务于使用价值和风格联想，不喧宾夺主。",
  },
];

const DEFAULT_DETAILS_IMAGE_PLAN: Omit<AllCategoryImagePlanItem, "id">[] = [
  {
    title: "封面主视觉图",
    description: "作为详情页首屏，建立商品调性和整组图统一氛围。",
    detailPrompt: "使用完整商品主视觉、统一背景和明确视觉层级，快速交代商品是什么、适合谁、核心价值是什么。",
  },
  {
    title: "细节质感展示",
    description: "展示材质、纹理、工艺、接口、配件或局部结构，增强信任。",
    detailPrompt: "使用微距特写或分区细节图，所有细节必须来自参考图或用户描述，避免生成不存在的结构和文字。",
  },
  {
    title: "修身廓形解析",
    description: "解释版型、比例、结构、穿着/摆放效果或商品形态优势。",
    detailPrompt: "用轮廓线、对比姿态、角度拆解或结构示意说明商品形态；若非服饰品类，则转换为结构轮廓与使用姿态解析。",
  },
  {
    title: "规格与尺码参考",
    description: "整理尺寸、容量、重量、材质、适用范围等决策信息。",
    detailPrompt: "只呈现用户提供或可高置信识别的规格信息；缺失精确数值时使用位置示意、比例参考和待填字段，不虚构参数。",
  },
];

function buildExtraPlanItem(imageType: ProductSetImageType, index: number): Omit<AllCategoryImagePlanItem, "id"> {
  return {
    title: `${imageType === "main" ? "主图" : "详情图"}补充模块 ${index}`,
    description: "可编辑的补充图片模块，用于承接额外卖点、场景或参数说明。",
    detailPrompt: "围绕单一信息目标设计画面，保持商品细节一致、构图清晰、文字克制，并避免与前序图片重复。",
  };
}

function normalizeText(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOption<T extends string>(value: T | string | undefined, fallback: T): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function findFieldValue(lines: string[], keys: string[]) {
  for (const line of lines) {
    const match = line.match(/^[-*•\s]*([^:：]{1,24})[:：]\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    if (keys.some((candidate) => key.includes(candidate.toLowerCase()))) {
      return match[2].trim();
    }
  }
  return "";
}

function collectFieldValues(lines: string[], keys: string[], fallback: string[]) {
  const values: string[] = [];
  for (const line of lines) {
    const match = line.match(/^[-*•\s]*([^:：]{1,24})[:：]\s*(.+)$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      if (keys.some((candidate) => key.includes(candidate.toLowerCase()))) {
        values.push(...splitValues(match[2]));
      }
      continue;
    }

    if (looksLikeListItem(line) && keys.some((key) => line.toLowerCase().includes(key.toLowerCase()))) {
      values.push(cleanListMarker(line));
    }
  }

  return unique(values).length ? unique(values).slice(0, 8) : fallback;
}

function splitValues(value: string) {
  return value
    .split(/[；;、,，|/]/)
    .map((item) => cleanListMarker(item))
    .filter(Boolean);
}

function cleanListMarker(value: string) {
  return value.replace(/^[-*•\d.、\s]+/, "").trim();
}

function looksLikeListItem(value: string) {
  return /^[-*•\d.、\s]+/.test(value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${EMPTY_FALLBACK}`;
}
