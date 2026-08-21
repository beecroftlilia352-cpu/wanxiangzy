import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import { STANDARD_MULTI_IMAGE_UPLOAD_LIMIT } from "@/lib/multi-image-upload-limits";

/**
 * 商品图图片翻译模块（Image Translation）
 *
 * 商用生产级提示词规则：
 * - 严格识别图1中的可见文字，按"原文位置 → 目标语言短句"逐处替换；
 * - 禁止改写品牌、产品名、SKU、参数、认证、专利、价格、链接、二维码和条形码；
 * - 保留原始构图、人物、主体、光线和背景；
 * - 输出语种尊重目标地区写法（简繁、地区拼写、阿拉伯字形、印地语天城文等）；
 * - 多语言输出时一次性合并生成多语言版本，不丢失图1原有非文字元素。
 */

export const MAX_IMAGE_TRANSLATION_IMAGES = STANDARD_MULTI_IMAGE_UPLOAD_LIMIT;
export const MAX_IMAGE_TRANSLATION_LANGUAGES = 20;

export type ImageTranslationLanguageEntry = {
  label: string;
  enLabel: string;
  isCommon: boolean;
  sort: number;
};

export type ImageTranslationLanguageGroup = ImageTranslationLanguageEntry[];

export type ImageTranslationLanguageRegion = {
  label: string;
  enLabel: string;
  isCommon: boolean;
  sort: number;
  children: ImageTranslationLanguageGroup[];
};

export type ImageTranslationLanguageConfig = ImageTranslationLanguageRegion[];

export type ImageTranslationLanguageCode = {
  code: string;
  label: string;
  enLabel: string;
  isCommon: boolean;
};

export type ImageTranslationPayloadBase = {
  sourceUrl: string;
  sourceUrls: string[];
  languages: string[];
  languageLabels: string[];
  /** 用户在补充说明里写的可选文案 */
  userPrompt?: string;
  aiModel: LingyaModel;
  imageSize: ImageSize;
  aspectRatio: AspectRatio;
  prompt: string;
  genCount: number;
};

export type ImageTranslationExampleItem = {
  picUrl: string;
  title?: string;
  thumbUrl?: string;
  thumbs?: Record<string, string>;
};

export type ImageTranslationExampleConfig = ImageTranslationExampleItem[];

export function flattenImageTranslationLanguages(
  config: ImageTranslationLanguageConfig
): ImageTranslationLanguageCode[] {
  const result: ImageTranslationLanguageCode[] = [];
  const seen = new Set<string>();
  for (const region of config) {
    for (const group of region.children) {
      for (const entry of group) {
        const code = (entry.enLabel && entry.enLabel.trim()) || entry.label.trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        result.push({
          code,
          label: entry.label,
          enLabel: entry.enLabel || entry.label,
          isCommon: entry.isCommon === true,
        });
      }
    }
  }
  return result;
}

export function pickCommonImageTranslationLanguages(
  config: ImageTranslationLanguageConfig
): ImageTranslationLanguageCode[] {
  return flattenImageTranslationLanguages(config).filter((item) => item.isCommon);
}

export type ImageTranslationLanguageCodeRef = Pick<ImageTranslationLanguageCode, "code"> | { code: string };

export function normalizeImageTranslationLanguageCodes(
  raw: unknown,
  known: ImageTranslationLanguageCodeRef[]
): string[] {
  if (!Array.isArray(raw)) return [];
  const knownByCode = new Set(known.map((item) => item.code));
  const knownByLabel = new Set(
    known
      .map((item) => ("label" in item ? item.label : undefined))
      .filter((label): label is string => typeof label === "string")
  );
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value) continue;
    const normalized = knownByCode.has(value) ? value : knownByLabel.has(value) ? value : value;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    codes.push(normalized);
    if (codes.length >= MAX_IMAGE_TRANSLATION_LANGUAGES) break;
  }
  return codes;
}

export function normalizeImageTranslationSourceUrls(rawUrls: unknown, fallback?: string): string[] {
  const list = Array.isArray(rawUrls)
    ? rawUrls.filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  const merged: string[] = [];
  const seen = new Set<string>();
  if (fallback && typeof fallback === "string" && fallback.length) {
    if (!seen.has(fallback)) {
      seen.add(fallback);
      merged.push(fallback);
    }
  }
  for (const url of list) {
    if (seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
    if (merged.length >= MAX_IMAGE_TRANSLATION_IMAGES) break;
  }
  return merged;
}

const IMAGE_TRANSLATION_TEXT_HARD_RULE = [
  "图片翻译硬规则：",
  "1. 仅替换图1中可直接读出的文字（标题、标签、参数、说明、按钮、徽章、口号、标语）。",
  "2. 不得修改任何品牌、商标、Logo、产品名、型号、SKU、参数值、专利号、认证标识、成分表、价格、链接、二维码、条形码或序列号；这些元素在所有语言版本中保持原样。",
  "3. 不得改变图1的人物、模特、产品外形、配色、构图、视角、景别、光线方向、阴影、背景、相机质感和裁切范围。",
  "4. 翻译后必须使用目标语言本地化写法（阿拉伯文使用阿拉伯字形、印地语使用天城文、繁体使用正体、英文地区版使用对应拼写），不允许机器拼音/罗马化/音译替代。",
  "5. 字号、字距、行距、字体重量、颜色、对齐方式和所在图层位置应贴合原图，禁止把所有文字统一塞到底部或拉伸铺满画面。",
  "6. 替换文字后必须保持背景透明遮罩、文字描边、阴影、渐变和叠层关系，不要留下任何原文残影或擦除白边。",
  "7. 不允许新增原文没有的装饰文字、贴纸、印章、水印、角标、虚构认证或商业标识。",
  "8. 当图1没有可见文字时，直接输出与原图一致的成片，并在结果中保留原图全部视觉元素。",
].join("\n");

const IMAGE_TRANSLATION_LOCALIZATION_RULE = [
  "地区本地化规则：",
  "- 英语默认美式拼写（color / favor），英式目标请用英式拼写（colour / favour），加拿大/澳大利亚/印度等地区目标按当地主流拼写处理。",
  "- 中文默认输出简体中文；如目标为繁体，必须使用台湾/香港正体而非简体转大五码，保留当地惯用词（如「軟體」/「网络」/「連結」）。",
  "- 阿拉伯语使用现代标准阿拉伯语，字符右起，配合 RTL 排版方向；不要混入波斯/乌尔都字符。",
  "- 印地语使用天城文（देवनागरी），孟加拉语使用孟加拉文，保留当地量词与数字格式。",
  "- 拉丁语系（西/葡/法/德/意等）保留变音符号（á/é/í/ó/ú/ñ/ç/ß 等），禁止去掉重音。",
  "- 短句优先，不使用超过原文长度的翻译，避免压缩变形；语气贴合电商商品图（标题短促、卖点清晰、参数工整）。",
].join("\n");

const IMAGE_TRANSLATION_QUALITY_RULE =
  "图像质量：photorealistic commercial product localization, faithful source exposure and color mood, true-to-source product rendering, true-to-source font weight and alignment, clean rebuilt typography without leftover glyphs, no extra sharpening, no HDR, no halftone, no moire, no AI-style overlay, no watermark, no chat bubble, no translated brand logo.";

const IMAGE_TRANSLATION_NEGATIVE_RULE = [
  "负面约束：",
  "禁止改写品牌名、Logo、产品型号、参数值、价格、链接、二维码、条形码、认证标识；",
  "禁止修改人物、产品外形、构图、视角、光线方向、阴影、景别、画幅和背景；",
  "禁止把文字统一塞到底部或生成原文没有的标签；",
  "禁止替换文字后留下原文字残影或出现擦除白边；",
  "禁止出现翻译水印、AI 水印、附加文字、虚构认证或商业徽章。",
].join("");

function buildLanguageSentence(languages: string[], languageLabels: string[]) {
  if (!languages.length) return "请按目标语言本地化输出。";
  const en = languages.join(" / ");
  const zh = languageLabels.length ? languageLabels.join(" / ") : en;
  return `本次翻译目标语言：${zh}（${en}）。每一种语言分别对应一张结果图，按上述顺序合并输出。`;
}

function buildImageTranslationMultiImageRule(sourceCount: number) {
  if (sourceCount <= 1) {
    return "单张原图：仅翻译图1中的可见文字。";
  }
  return `批量原图（共 ${sourceCount} 张）：图1~图${sourceCount} 分别独立翻译并独立输出，最终按原图顺序 × 目标语言顺序合并输出，每张结果都对应唯一一张原图 + 一种目标语言。`;
}

export function buildImageTranslationPrompt(params: {
  sourceCount: number;
  languages: string[];
  languageLabels: string[];
  userPrompt?: string;
  aiModel?: LingyaModel;
  imageSize?: ImageSize;
}) {
  const sourceCount = Math.max(1, Math.min(params.sourceCount || 1, MAX_IMAGE_TRANSLATION_IMAGES));
  const languageCount = Math.max(1, Math.min(params.languages.length || 0, MAX_IMAGE_TRANSLATION_LANGUAGES));
  const languageSentence = buildLanguageSentence(params.languages, params.languageLabels);
  const imageRule = buildImageTranslationMultiImageRule(sourceCount);
  const userPromptText = (params.userPrompt || "").trim();
  const modelLine = params.aiModel ? `生成模型：${params.aiModel}（${params.imageSize || "1K"}）。` : "";

  return [
    IMAGE_TRANSLATION_TEXT_HARD_RULE,
    IMAGE_TRANSLATION_LOCALIZATION_RULE,
    `核心任务：完成图1 中的可读文字本地化翻译（${languageCount} 种目标语言 × ${sourceCount} 张原图）。`,
    imageRule,
    languageSentence,
    modelLine,
    IMAGE_TRANSLATION_QUALITY_RULE,
    userPromptText ? `用户补充：${userPromptText}` : "用户补充：无。",
    IMAGE_TRANSLATION_NEGATIVE_RULE,
    "输出要求：photorealistic localized product photo, ready-to-publish ecommerce listing image, clean typography, no extra decoration, no AI watermark, no chat bubble.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildImageTranslationPerCallPrompt(params: {
  sourceIndex: number;
  sourceCount: number;
  language: string;
  languageLabel: string;
  userPrompt?: string;
  aiModel?: LingyaModel;
  imageSize?: ImageSize;
}): string {
  const { sourceIndex, sourceCount, language, languageLabel } = params;
  const userPromptText = (params.userPrompt || "").trim();
  const modelLine = params.aiModel ? `生成模型：${params.aiModel}（${params.imageSize || "1K"}）。` : "";
  // 用 ISO/Babel 名称 + 中文/英文双语双锁，避免 LLM 误解
  const targetLang = `${languageLabel}（English name: ${language}）`;
  return [
    IMAGE_TRANSLATION_TEXT_HARD_RULE,
    IMAGE_TRANSLATION_LOCALIZATION_RULE,
    `核心任务：翻译图1 中的可读文字。MUST translate every readable text in image 1 into ${targetLang} ONLY.`,
    `目标语言锁定：${targetLang}。本次输出所有可读文字必须使用 ${languageLabel}（${language}）写法，包括标题、标签、按钮、徽章、口号、说明。`,
    `DO NOT mix any other language. If you are unsure, default to ${language}.`,
    `当前批次：第 ${sourceIndex + 1}/${sourceCount} 张原图，本次调用只翻译这一张原图（image 1）。`,
    "图1 是唯一商品图事实来源；请勿假设任何其它输入图像存在。",
    modelLine,
    IMAGE_TRANSLATION_QUALITY_RULE,
    userPromptText ? `用户补充：${userPromptText}` : "用户补充：无。",
    IMAGE_TRANSLATION_NEGATIVE_RULE,
    "输出要求：photorealistic localized product photo, ready-to-publish ecommerce listing image, clean typography, no extra decoration, no AI watermark, no chat bubble.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function enforceImageTranslationPromptRequirements(
  prompt: string,
  params?: { languages?: string[]; languageLabels?: string[]; sourceCount?: number }
): string {
  const text = (prompt || "").trim();
  if (!text) {
    return buildImageTranslationPrompt({
      sourceCount: params?.sourceCount ?? 1,
      languages: params?.languages ?? [],
      languageLabels: params?.languageLabels ?? [],
    });
  }
  const blocks: string[] = [text];
  if (!/图片翻译硬规则|图片翻译/.test(text)) {
    blocks.unshift(IMAGE_TRANSLATION_TEXT_HARD_RULE);
  }
  if (!/地区本地化|本地化规则/.test(text)) {
    blocks.push(IMAGE_TRANSLATION_LOCALIZATION_RULE);
  }
  if (!/图像质量|photorealistic/.test(text)) {
    blocks.push(IMAGE_TRANSLATION_QUALITY_RULE);
  }
  if (!/负面约束|禁止/.test(text)) {
    blocks.push(IMAGE_TRANSLATION_NEGATIVE_RULE);
  }
  return blocks.filter(Boolean).join("\n");
}

export type ImageTranslationGroupedCellStatus = "completed" | "running" | "failed" | "idle";

export type ImageTranslationGroupedCell = {
  sourceId: string;
  targetId: string;
  url?: string | null;
  status: ImageTranslationGroupedCellStatus;
  progress?: number;
  failureLabel?: string;
  failureDetail?: string;
};

/**
 * 把 N 张原图 × M 种语言的扁平 result slot 数组映射回 (source, language) 网格，
 * 配合 `components/studio/GroupedResultGrid` 的 GroupedResultCell 结构使用。
 *
 * 槽位顺序：slotIndex = sourceIndex * targetCount * perLanguageCount + languageIndex * perLanguageCount + g
 *   - 每张原图先行 (s 维度)
 *   - 同张原图内按语言顺序 (t 维度)
 *   - 同语言下多张变体 (g 维度)
 */
export function buildImageTranslationGroupedCells(input: {
  sourceCount: number;
  targetCount: number;
  perLanguageCount: number;
  resultUrls: ReadonlyArray<string | null | undefined>;
  isGenerating: boolean;
  progress: number;
  activeResultExpectedCount: number;
  partialFailureMessage?: string;
  failureLabel?: string;
}): ImageTranslationGroupedCell[] {
  const {
    sourceCount,
    targetCount,
    perLanguageCount,
    resultUrls,
    isGenerating,
    progress,
    activeResultExpectedCount,
    partialFailureMessage,
    failureLabel,
  } = input;

  const cells: ImageTranslationGroupedCell[] = [];
  for (let s = 0; s < sourceCount; s += 1) {
    for (let t = 0; t < targetCount; t += 1) {
      for (let g = 0; g < perLanguageCount; g += 1) {
        const slotIndex = s * targetCount * perLanguageCount + t * perLanguageCount + g;
        const url = resultUrls[slotIndex] ?? null;
        const hasCompleted = Boolean(url);
        const expectedTotal = sourceCount * targetCount * perLanguageCount;
        const overExpected = activeResultExpectedCount > expectedTotal;
        const status: ImageTranslationGroupedCellStatus = isGenerating
          ? hasCompleted
            ? "completed"
            : "running"
          : hasCompleted
            ? "completed"
            : overExpected
              ? "idle"
              : "failed";
        cells.push({
          sourceId: `source-${s}`,
          targetId: `lang-${t}`,
          url,
          status,
          progress:
            isGenerating && !hasCompleted
              ? Math.max(0, Math.min(99, Math.round(progress)))
              : hasCompleted
                ? 100
                : 0,
          failureLabel: status === "failed" ? failureLabel || "本张翻译失败" : undefined,
          failureDetail: status === "failed" ? partialFailureMessage : undefined,
        });
      }
    }
  }
  return cells;
}
