/**
 * 「商品标题」的 system prompt（SHEIN 欧洲站规范原文）、上游 messages 的拼装，与本地自检（lint）词表。
 *
 * 为什么单独一个文件：
 *   · 规范原文是由运营给定的**逐字**文本，不能混进服务端逻辑里被顺手改写；
 *   · 词表集中在这里，服务端 lint 与单测都从同一份常量取，避免两处散落不同的词；
 *   · 规范文本的**放置位置**在这里一处可切换（见 PRODUCT_TITLE_SPEC_PLACEMENT），
 *     上游 messages 只在 buildProductTitleMessages 里拼装，别处不得硬编码这两段文本。
 *
 * lint 的定位（重要）：只做**纯本地正则**扫描，不发任何额外上游请求，也**不改写**标题；
 *   命中即视为「违反规范」，服务端会据此自动带纠正指令重试一次（见 server.ts），
 *   重试后仍命中就照常返回结果、并在响应里标明（repaired:false + lint.hits 非空）。
 *
 * 命中词的大小写：hits 里放的是**标题里出现的原词**（如 "Microfiber"、"45cm"、"Safe"），
 *   匹配本身不区分大小写；同一个词（忽略大小写）只记一次。
 *
 * 本文件不依赖任何服务端模块，前端可安全导入（输入框默认值就取自这里的同一个常量）。
 */

import { PRODUCT_TITLE_MAX_CANDIDATES, PRODUCT_TITLE_MAX_CHARS } from "./types";

/**
 * 用户提供的 SHEIN 欧洲站商品标题规范原文（逐字保留：小标题、编号、**加粗** 标记、空行都不动）。
 * 全文只此一份，其它地方一律引用它，不要复制字符串。
 */
export const PRODUCT_TITLE_SPEC = `根据我提供的商品名称、商品图片或商品信息，生成适用于 SHEIN 欧洲跨境电商的英文商品标题。

### 1. 标题结构

**纺织品：**
数量 + 图案/颜色 + 产品名称 + 风格/特点 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节

**非纺织品：**
数量 + 特点词 + 产品名称 + 风格 + 图案/颜色 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节

标题结构可根据商品实际信息自然调整，不要求机械套用顺序。

### 2. 属性限制

- **标题中不要出现任何尺寸、长度、宽度、高度、厚度、容量、重量、规格等数字信息。**
- **标题中不要出现任何材质或材料相关词语。**
- 除必要且明确的商品数量外，尽量避免使用数字。
- 图片或商品信息中没有明确提供的颜色、图案、款式、功能、结构、用途、适用场景等属性，不得自行推测或虚构。
- 不确定的商品属性直接省略，不为了增加关键词强行补充。

### 3. SEO要求

按照欧洲消费者真实英文搜索习惯优化标题。

自然加入与商品高度相关的：核心产品关键词、常用搜索词、同义产品词、功能词、用途词、使用场景词、季节词。

核心关键词尽量靠前，同时兼顾长尾搜索词，提高搜索覆盖和曝光。

避免关键词机械堆砌、同义词过度重复、无关流量词以及不符合英语母语消费者搜索习惯的表达。

标题必须自然、准确、清晰、易读，并符合欧洲跨境电商商品标题表达习惯。

### 4. 字符要求

每条英文标题**不超过250个字符（包含空格和标点）**。

在准确、自然且不堆砌关键词的前提下，尽可能充分利用字符空间增加有效搜索关键词。

### 5. 输出要求

只生成 **1条英文商品标题**。

格式：

**英文标题（字符数）**

不要提供中文翻译、关键词分析、解释、备注或其他内容。

### 6. 禁词

禁止出现：

Safe、Safety、Quality Verified，以及任何与“安全、无害、认证达标”等含义相近的表达。

禁止任何关于 PFAS、PTFE、PFOA、PFOS 的 Free、Without、Non 或其他类似声明。

禁止任何环保、绿色、天然、可持续、碳中和、低碳、零排放、可降解、可堆肥、生物基、无塑料、回收、可回收、零废弃、海洋友好等相关词语，以及其英文同义词、近义词和变体。

### 7. 生成前强制自检

输出前自行检查：

- ≤250字符
- **无尺寸信息**
- **无规格数字**
- **无容量或重量信息**
- **无材质词**
- 无禁词及其近义表达
- 无图片或商品信息未提供的虚构属性
- 核心产品关键词靠前
- 同义搜索词高度相关
- 功能词、用途词、场景词与商品真实用途一致
- 无机械关键词堆砌
- 英文自然，符合欧洲消费者搜索表达

检查完成后，**只输出最终英文标题和字符数。**`;

/**
 * 给程序解析用的输出格式约定（规范文本之外的唯一附加段）。
 *
 * 输出数量由**本接口**定：恰好 3 条候选英文标题。规范 §5 写的是「只生成 1条」，
 * 那是给人工抄模板用的说法；程序要 3 条候选供运营挑选，所以在契约里显式覆盖
 * （并在契约里明说「即使规范正文提到只生成 1 条，本接口也要求输出 3 条」），
 * 避免模型照着 §5 只返回 1 条。规范原文（PRODUCT_TITLE_SPEC）一个字都不改。
 */
export const PRODUCT_TITLE_OUTPUT_FORMAT = `为了程序解析，请严格只返回如下 JSON，不要加代码块标记、不要加任何其它文字：
{"titles":[{"title":"<英文标题1>","charCount":<第1条字符数（含空格与标点）>},{"title":"<英文标题2>","charCount":<第2条字符数>},{"title":"<英文标题3>","charCount":<第3条字符数>}]}
必须恰好返回 3 条候选英文标题（titles 数组长度 = 3），3 条都要各自满足上面规范里的全部要求（结构、属性限制、SEO、每条不超过 250 字符、禁词、生成前强制自检）。
即使规范正文提到只生成 1 条，本接口也要求输出 3 条候选英文标题。
不要提供中文翻译、关键词分析、解释、备注或其他内容：只返回这个 JSON，不要代码块标记、不要其它文字。`;

/** 规范 + 输出格式（一律由上面两个常量拼出来，不复制字符串）。 */
function composeSystemPrompt(spec: string, outputFormat: string): string {
  const indented = outputFormat.split("\n").map((line) => `  ${line}`).join("\n");
  return `${spec}\n\n${indented}`;
}

/** 「规范放在 system 消息里」时用的完整前置条件（第 2 版行为，保持逐字不变）。 */
export const PRODUCT_TITLE_SYSTEM_PROMPT = composeSystemPrompt(PRODUCT_TITLE_SPEC, PRODUCT_TITLE_OUTPUT_FORMAT);

/**
 * 「规范放在 user 消息里」时 system 消息只保留**最小必要的机器契约**：
 * 角色一句话 + JSON 输出格式（放文本框里会被用户编辑掉，所以必须留在 system）。
 */
export const PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT = composeSystemPrompt(
  "你是资深跨境电商运营，负责按用户消息中给出的商品标题规范生成英文商品标题。",
  PRODUCT_TITLE_OUTPUT_FORMAT,
);

/** 规范文本的放置位置（一处切换即可；默认按「规范 = 输入框默认内容 + 用户输入=补充」）。 */
export type ProductTitleSpecPlacement = "system" | "user";

/**
 * 当前生效的放置位置（**一处切换即可**，用户已确认用 "user"）：
 *   · "user"（当前）  → 规范原文就是描述输入框的默认内容，用户在里面接着往后补充；
 *                       发往上游的 user 文本 = 文本框的完整内容，system 只放最小机器契约
 *                       （角色一句话 + JSON 输出格式，避免被用户编辑掉导致解析失败）；
 *   · "system"        → 规范原文放 system 前置条件（+ 输出格式），user 文本只放文本框内容。
 */
export const PRODUCT_TITLE_SPEC_PLACEMENT: ProductTitleSpecPlacement = "user";

/**
 * 描述输入框的默认内容（前端与上游 messages 拼装共用这一个常量来源，不在两处各写一份文案）。
 * placement = "user" 时就是规范原文本身（§1~§7 全文）；placement = "system" 时输入框默认为空。
 */
export const PRODUCT_TITLE_DEFAULT_DESCRIPTION = PRODUCT_TITLE_SPEC_PLACEMENT === "user"
  ? PRODUCT_TITLE_SPEC
  : "";

/* -------------------------------------------------------------------------- *
 * 上游 messages 拼装（唯一入口：system / user 两段文本只在这里生成）
 * -------------------------------------------------------------------------- */

export type ProductTitleChatTextPart = { type: "text"; text: string };
export type ProductTitleChatImagePart = { type: "image_url"; image_url: { url: string } };
export type ProductTitleChatContent = string | Array<ProductTitleChatTextPart | ProductTitleChatImagePart>;

export type ProductTitleChatMessage = {
  role: "system" | "user" | "assistant";
  content: ProductTitleChatContent;
};

export type ProductTitleMessagesInput = {
  /** 用户提供的商品名称/商品信息（可为空字符串；为空时不编造）。 */
  description: string;
  /** 实际内联的图片 data URL（非 vision 模型传空数组，保证绝不出现 image part）。 */
  imageDataUrls?: readonly string[];
  /** 图片张数（用于「综合多张图」的提示；缺省按 imageDataUrls.length）。 */
  imageCount?: number;
  /** 放置位置覆盖（一般不传，用 PRODUCT_TITLE_SPEC_PLACEMENT）。 */
  specPlacement?: ProductTitleSpecPlacement;
};

/**
 * 文本框之外的少量操作性提示（多图综合 / 文本框为空时不要编造）。
 * 只在确实需要时才追加，且**永远排在文本框内容之后**，不抢规范原文开头的位置。
 */
export function buildProductTitleOperationalNotes(input: { description: string; imageCount: number }): string {
  const notes: string[] = [];
  if (input.imageCount > 1) {
    notes.push(
      `我提供了 ${input.imageCount} 张商品图片：它们可能是同一商品的不同角度或不同部件（也可能组成套装），`
      + "请综合所有图片的信息给出统一的商品标题，不要只描述其中一张。",
    );
  }
  if (!input.description.trim()) {
    notes.push("没有提供商品名称/商品信息（文本框为空），请只根据图片中真实可见的内容生成标题，不要编造图片里看不到的信息。");
  }
  return notes.join("\n\n");
}

/**
 * 拼一次请求的全部 messages（system + 第一条 user）；重写重试时的 assistant/user 消息由调用方追加。
 *
 * placement = "user"（当前默认，用户已确认）：user 文本 = 文本框的完整内容
 *   （文本框默认值就是规范原文，用户在后面接着写补充描述；这里**不再前置拼一次规范**），
 *   需要时再追加少量操作性提示；system 只放最小必要的机器契约（角色一句话 + JSON 格式）。
 * placement = "system"：规范原文放 system（+输出格式），user 文本 = 文本框的完整内容。
 */
export function buildProductTitleMessages(input: ProductTitleMessagesInput): ProductTitleChatMessage[] {
  const placement = input.specPlacement ?? PRODUCT_TITLE_SPEC_PLACEMENT;
  const description = input.description ?? "";
  const imageDataUrls = input.imageDataUrls ?? [];
  const imageCount = input.imageCount ?? imageDataUrls.length;

  const notes = buildProductTitleOperationalNotes({ description, imageCount });
  const userText = [description.trim() ? description : "", notes].filter(Boolean).join("\n\n");

  const systemText = placement === "system"
    ? PRODUCT_TITLE_SYSTEM_PROMPT
    : PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT;

  return [
    { role: "system", content: systemText },
    {
      role: "user",
      // 有图 → 多模态 content parts；纯文字（或非 vision 模型）→ 纯字符串，绝不带 image_url。
      content: imageDataUrls.length
        ? [
            { type: "text", text: userText },
            ...imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ]
        : userText,
    },
  ];
}

/** 字符上限（与规范正文里的 250 保持一致；服务端自行复算长度，不信任模型给的 charCount）。 */
export const PRODUCT_TITLE_CHAR_LIMIT = PRODUCT_TITLE_MAX_CHARS;

/* -------------------------------------------------------------------------- *
 * 自检词表（全部小写；匹配时忽略大小写）
 * -------------------------------------------------------------------------- */

/**
 * 材质/材料词表（规范 §2：标题中不要出现任何材质或材料相关词语）。
 * 刻意不收「iron / paper」这类既是材料、又常作为商品名的词（curling iron、paper towel），
 * 避免误判触发无谓的重试。
 */
export const PRODUCT_TITLE_MATERIAL_TERMS: readonly string[] = [
  "microfiber",
  "microfibre",
  "stainless steel",
  "cotton",
  "polyester",
  "silk",
  "satin",
  "linen",
  "wool",
  "woolen",
  "woollen",
  "cashmere",
  "mohair",
  "acrylic",
  "nylon",
  "spandex",
  "elastane",
  "lycra",
  "rayon",
  "viscose",
  "velvet",
  "leather",
  "leatherette",
  "suede",
  "denim",
  "canvas",
  "fleece",
  "flannel",
  "chiffon",
  "lace",
  "tulle",
  "corduroy",
  "tweed",
  "hemp",
  "jute",
  "bamboo",
  "rubber",
  "silicone",
  "latex",
  "neoprene",
  "plastic",
  "steel",
  "aluminum",
  "aluminium",
  "brass",
  "copper",
  "bronze",
  "titanium",
  "alloy",
  "zinc",
  "metal",
  "metallic",
  "wood",
  "wooden",
  "timber",
  "glass",
  "ceramic",
  "porcelain",
  "stoneware",
  "terracotta",
  "clay",
  "resin",
  "epoxy",
  "foam",
  "sponge",
  "eva",
  "tpu",
  "pvc",
  "abs",
];

/**
 * 尺寸/规格/容量/重量数字的识别规则（规范 §2 第一条 + §7）。
 * 只认「带计量单位」或「A x B 组合」的数字；纯数量词（2-pack / 2 pcs / 3 pieces）不算，
 * 因此数量词天然不会被误报。
 */
export const PRODUCT_TITLE_MEASUREMENT_PATTERNS: readonly RegExp[] = [
  // 45cm / 30 inch / 12.5 mm / 500ml / 2kg / 8 oz / 128GB / 5W ...
  /\b\d+(?:[.,]\d+)?\s*-?\s*(?:cm|centimet(?:er|re)s?|mm|millimet(?:er|re)s?|inch|inches|ft|feet|foot|yd|yards?|meters?|metres?|ml|millilit(?:er|re)s?|lit(?:er|re)s?|fl\s*oz|oz|ounces?|lb|lbs|pounds?|kg|kilograms?|kilogrammes?|grams?|grammes?|mg|mah|khz|mhz|ghz|hz|gb|tb|mb|kb|kpa|psi|bar|watts?|kw|volts?|celsius|fahrenheit|°c|°f)\b/i,
  // 12 x 8 / 10x20 / 2 × 3
  /\b\d+(?:[.,]\d+)?\s*(?:x|×|✕|\*)\s*\d+(?:[.,]\d+)?\b/i,
];

/**
 * 禁词表（规范 §6）。
 * 有变体的词（safe/safely/safety、recycle/recycled/recyclable…）写成正则，
 * 保证命中词能原样报出来（如 "recyclable"）。
 */
export const PRODUCT_TITLE_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bquality\s+verified\b/i,
  /\bsafe(?:ly|r)?\b/i,
  /\bsafety\b/i,
  // PFAS / PTFE / PFOA / PFOS：单独出现或与 free/without/non 连用都算违规。
  /\b(?:free|without|non|no)[\s-]*(?:pfas|ptfe|pfoa|pfos)\b/i,
  /\b(?:pfas|ptfe|pfoa|pfos)[\s-]*(?:free|without)\b/i,
  /\bpfas\b/i,
  /\bptfe\b/i,
  /\bpfoa\b/i,
  /\bpfos\b/i,
  // 环保类：eco / eco-friendly / environmentally / green / natural / sustainable ...
  /\beco(?:-friendly)?\b/i,
  /\benvironmentally\b/i,
  /\bgreen\b/i,
  /\bnatural\b/i,
  /\bsustainab(?:le|ility)\b/i,
  /\bcarbon[\s-]neutral\b/i,
  /\blow[\s-]carbon\b/i,
  /\bzero[\s-]emissions?\b/i,
  /\bbiodegradable\b/i,
  /\bcompostable\b/i,
  /\bbio-?based\b/i,
  /\bplastic[\s-]?free\b/i,
  /\brecycl(?:e|ed|es|ing|able)\b/i,
  /\bzero[\s-]waste\b/i,
  /\bocean[\s-]friendly\b/i,
  // §6 里「与安全、无害含义相近的表达」的常见变体。
  /\bnon-?toxic\b/i,
  /\bharmless\b/i,
];

export type ProductTitleLintCategory = "material" | "measurement" | "forbidden";

export type ProductTitleLintDetail = {
  category: ProductTitleLintCategory;
  /** 标题里出现的原词（保留原标题大小写）。 */
  term: string;
  /** 在标题中的起始下标（用于按标题顺序输出）。 */
  index: number;
};

export type ProductTitleLintResult = {
  /** 只要有任何命中（材质 / 尺寸数字 / 禁词）就是 true。 */
  hasForbidden: boolean;
  /** 命中的原词（按在标题里出现的先后去重）。 */
  hits: string[];
  /** 分类明细（服务端拼纠正指令用；不直接返回给前端）。 */
  details: ProductTitleLintDetail[];
};

/** 材质词的正则（长词优先，避免 "steel" 抢在 "stainless steel" 前面命中）。 */
const MATERIAL_PATTERN = buildWordPattern(PRODUCT_TITLE_MATERIAL_TERMS);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 由词表拼一个「整词匹配、忽略大小写」的正则；长词排前面，保证命中更长的那一个。 */
function buildWordPattern(terms: readonly string[]): RegExp {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${sorted.map(escapeRegExp).join("|")})\\b`, "gi");
}

function collectMatches(
  title: string,
  pattern: RegExp,
  category: ProductTitleLintCategory,
): ProductTitleLintDetail[] {
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const matches: ProductTitleLintDetail[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(title)) !== null) {
    if (match[0]) matches.push({ category, term: match[0], index: match.index });
    // 零宽匹配兜底，避免死循环。
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return matches;
}

/**
 * 本地自检：扫一遍标题，返回命中的材质词 / 尺寸数字 / 禁词。
 * 纯正则、无副作用、不改写标题；同一位置优先保留更长的命中（如 "stainless steel" 优于 "steel"），
 * 同一个词（忽略大小写）只记一次。
 */
export function lintProductTitle(title: string): ProductTitleLintResult {
  const text = typeof title === "string" ? title : "";
  if (!text.trim()) return { hasForbidden: false, hits: [], details: [] };

  const found: ProductTitleLintDetail[] = [
    ...collectMatches(text, MATERIAL_PATTERN, "material"),
    ...PRODUCT_TITLE_MEASUREMENT_PATTERNS.flatMap((pattern) => collectMatches(text, pattern, "measurement")),
    ...PRODUCT_TITLE_FORBIDDEN_PATTERNS.flatMap((pattern) => collectMatches(text, pattern, "forbidden")),
  ].sort((a, b) => (a.index - b.index) || (b.term.length - a.term.length));

  const seen = new Set<string>();
  const details: ProductTitleLintDetail[] = [];
  for (const item of found) {
    const key = item.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    details.push(item);
  }

  return {
    hasForbidden: details.length > 0,
    hits: details.map((item) => item.term),
    details,
  };
}

/** 按类别取命中词（保留标题里的原始大小写），供拼纠正指令使用。 */
export function productTitleHitsByCategory(
  lint: ProductTitleLintResult,
): Record<ProductTitleLintCategory, string[]> {
  const groups: Record<ProductTitleLintCategory, string[]> = { material: [], measurement: [], forbidden: [] };
  for (const item of lint.details) groups[item.category].push(item.term);
  return groups;
}

export type ProductTitleRepairItem = {
  /** 第几条（从 1 开始，与结果区展示顺序一致）。 */
  index: number;
  materialHits: readonly string[];
  measurementHits: readonly string[];
  forbiddenHits: readonly string[];
  /** 服务端复算的字符数是否超过 250。 */
  overLimit: boolean;
};

export type ProductTitleRepairInput = {
  /** 只列**不合规的那几条**（合规的不用重写，避免整批被改动）。 */
  items: readonly ProductTitleRepairItem[];
};

function quoteTerms(terms: readonly string[]): string {
  return terms.map((term) => `"${term}"`).join("、");
}

/**
 * 拼「重写一次」的纠正指令（第 2 次请求的 user 消息）。
 *
 * 逐条列出：**第几条**、命中的**原词**（材质词 / 尺寸容量规格数字 / 禁词各不相同），
 * 末尾再要求仍是 3 条。单条只命中材质词时的措辞与实测有效的那一版保持一致：
 *   第 1 条标题违反了规则：出现了材质词 "Microfiber"，且标题不允许出现任何材质或材料相关词语，
 *   也不允许出现尺寸/容量/规格数字。请在不丢失核心产品关键词与搜索覆盖的前提下重写这一条，
 *   去掉所有材质词，仍然只返回同样的 JSON。
 * 超长（>250）的那条再追加规范里的精简要求。
 */
export function buildProductTitleRepairInstruction(input: ProductTitleRepairInput): string {
  const parts: string[] = [];

  for (const item of input.items) {
    const material = [...item.materialHits];
    const measurement = [...item.measurementHits];
    const forbidden = [...item.forbiddenHits];
    const label = `第 ${item.index} 条标题`;

    const segments: string[] = [];
    if (material.length) segments.push(`出现了材质词 ${quoteTerms(material)}`);
    if (measurement.length) segments.push(`出现了尺寸/容量/规格数字 ${quoteTerms(measurement)}`);
    if (forbidden.length) segments.push(`出现了禁词 ${quoteTerms(forbidden)}`);

    if (segments.length) {
      const extra: string[] = [];
      if (measurement.length) extra.push("、尺寸/容量/规格数字");
      if (forbidden.length) extra.push("与禁词");
      parts.push(
        `${label}违反了规则：${segments.join("；")}，且标题不允许出现任何材质或材料相关词语，`
        + `也不允许出现尺寸/容量/规格数字。请在不丢失核心产品关键词与搜索覆盖的前提下重写这一条，`
        + `去掉所有材质词${extra.join("")}，仍然只返回同样的 JSON。`,
      );
    }
    if (item.overLimit) {
      parts.push(
        `${label}超过 ${PRODUCT_TITLE_CHAR_LIMIT} 字符，请在不丢失核心关键词的前提下精简到 `
        + `${PRODUCT_TITLE_CHAR_LIMIT} 字符以内，仍然只返回同样的 JSON。`,
      );
    }
  }

  if (parts.length) {
    parts.push(
      `本次仍然必须返回 ${PRODUCT_TITLE_MAX_CANDIDATES} 条候选英文标题，JSON 结构与上面完全一致`
      + `（titles 数组长度 = ${PRODUCT_TITLE_MAX_CANDIDATES}，每条都要各自满足规范全部要求）。`,
    );
  }
  return parts.join("\n");
}
