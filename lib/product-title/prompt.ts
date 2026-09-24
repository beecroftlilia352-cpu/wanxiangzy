/**
 * 「商品标题」的 system prompt（SHEIN 欧洲站规范原文）、上游 messages 的拼装，与本地自检（lint）词表。
 *
 * 为什么单独一个文件：
 *   · 规范原文是由运营给定的**逐字**文本（当前为第 5 版规范，逐字取自运营给的规范文件），
 *     不能混进服务端逻辑里被顺手改写；
 *   · 词表集中在这里，服务端 lint 与单测都从同一份常量取，避免两处散落不同的词；
 *   · 规范文本的**放置位置**在这里一处可切换（见 PRODUCT_TITLE_SPEC_PLACEMENT），
 *     上游 messages 只在 buildProductTitleMessages 里拼装，别处不得硬编码这两段文本。
 *
 * lint 的定位（第 5 版规范，重要）：只做两类检查，不发任何额外上游请求，也**不改写**标题：
 *   ① 禁词（规范第 4 节：Safe / Safety / Quality Verified 及「安全、无害、认证达标」近义；
 *      PFAS / PTFE / PFOA / PFOS 的 Free / Without / Non 类声明；环保、绿色、天然、可持续、
 *      碳中和、低碳、零排放、可降解、可堆肥、生物基、无塑料、回收、可回收、零废弃、海洋友好
 *      及其同义词/近义词/变体）——命中即视为「违反规范」，服务端据此自动带纠正指令**重试一次**
 *      （见 server.ts），重试后仍命中就照常返回结果、并在响应里标明（repaired:false）。
 *   ② 超长（>250 字符）——**只**逐条标注 overLimit，不改写、不报错、不重试（见 server.ts）。
 *
 * **材质词与尺寸/容量数字不再参与 lint（第 5 版规范的关键变化）**：新规范的标题结构明确包含
 *   「材质」与（非纺织品的）「容量/尺寸」，命中它们是**合规**的，绝不能因此重写标题——
 *   旧版本那套「命中材质词/尺寸数字就自动纠正重试」的 lint 已被拆除。
 *
 * 命中词的大小写：hits 里放的是**标题里出现的原词**（如 "Safe"、"Recyclable"），
 *   匹配本身不区分大小写；同一个词（忽略大小写）只记一次。
 *
 * 本文件不依赖任何服务端模块，前端可安全导入（输入框默认值就取自这里的同一个常量）。
 */

import { PRODUCT_TITLE_MAX_CANDIDATES, PRODUCT_TITLE_MAX_CHARS } from "./types";

/**
 * 用户提供的 SHEIN 欧洲站商品标题规范原文（第 5 版）。
 *
 * **逐字**保留：换行、空行、行首空格、全角括号、顿号与加号等标点，一个字符都不自行整理。
 * 这份常量与运营给的规范文件**逐字节相同**（含文件末尾的换行）；全文只此一份，
 * 其它地方一律引用它，不要复制字符串。
 */
export const PRODUCT_TITLE_SPEC = `根据我提供的商品名称、图片或商品信息，生成适用于 SHEIN 欧洲跨境电商的英文商品标题。

1. 标题结构：
   纺织品：数量 + 图案/颜色 + 产品名称 + 风格 + 材质 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节。

非纺织品：数量 + 容量/尺寸 + 特点词 + 材质 + 产品名称 + 风格 + 图案/颜色 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节。

2. SEO要求：
   按照欧洲消费者真实英文搜索习惯优化标题。

自然加入与商品高度相关的：
核心产品关键词、常用搜索词、同义产品词、功能词、用途词、使用场景词、季节词。

核心关键词尽量靠前，同时兼顾长尾搜索词，提高搜索覆盖和曝光。

避免关键词机械堆砌、同义词过度重复、无关流量词以及不符合英语母语消费者搜索习惯的表达。

标题必须自然、准确、清晰、易读，并符合欧洲跨境电商商品标题表达习惯。

每条标题超过200个字符但不超过250个字符（包含空格和标点），在自然、准确、易读的前提下尽量充分利用字符增加有效搜索关键词。

3. 输出要求：
   生成3条最好的最符合的欧洲跨境英文标题供选择，并说明理由。

4. 禁词：
   禁止出现 Safe、Safety、Quality Verified，以及任何与“安全、无害、认证达标”含义相近的表达；禁止任何 PFAS、PTFE、PFOA、PFOS 的 Free / Without / Non 等声明；禁止任何环保、绿色、天然、可持续、碳中和、低碳、零排放、可降解、可堆肥、生物基、无塑料、回收、可回收、零废弃、海洋友好等相关词语及其同义词、近义词或变体。

生成前自行检查：≤250字符、无禁词、无虚构属性、关键词高度相关、英文自然，符合欧洲消费者搜索表达。
`;

/**
 * 给程序解析用的输出格式约定（规范文本之外的唯一附加段）。
 *
 * 输出数量由**本接口**定：恰好 3 条候选英文标题（用户明确要求「生成标题数依旧保持三条」）。
 * 规范正文里的条数说法以本契约段为准；规范第 3 节「并说明理由」也不需要输出
 * （理由会污染标题并破坏 JSON），这些都在契约里显式写清楚。
 * 规范原文（PRODUCT_TITLE_SPEC）一个字都不改。
 */
export const PRODUCT_TITLE_OUTPUT_FORMAT = `为了程序解析，请严格只返回如下 JSON，不要加代码块标记、不要加任何其它文字：
{"titles":[{"title":"<英文标题1>","zh":"<第1条英文标题的中文对照>","charCount":<第1条英文标题的字符数（含空格与标点）>},{"title":"<英文标题2>","zh":"<第2条英文标题的中文对照>","charCount":<第2条英文标题的字符数>},{"title":"<英文标题3>","zh":"<第3条英文标题的中文对照>","charCount":<第3条英文标题的字符数>}]}
本段是给程序解析的**机器契约**：与规范正文冲突的地方（候选条数、输出格式、是否需要说明理由）一律**以本段为准**。
必须恰好返回 3 条候选英文标题（titles 数组长度 = 3），3 条都要各自满足上面规范里的全部要求（标题结构、SEO要求、每条不超过 250 字符、禁词、生成前自行检查）。
规范正文说「并说明理由」：本接口**不需要**说明理由——不要输出理由、不要输出解释、不要输出关键词分析、不要输出备注（它们会污染标题并破坏上面的 JSON）。
zh 是**对应那条英文标题的中文翻译对照**（直译意思即可，供运营阅读，不用于上架）；不要写成卖点分析、关键词解释或备注。
zh **不参与任何合规约束**：规范第 4 节的禁词、以及「不超过 250 字符」都**只针对英文 title**；zh 里出现任何词都不算违规（中文里自然会出现各种字词）。
charCount 指的是**英文 title** 的字符数（含空格与标点），**不是** zh 的字符数。
标题结构里要求的**材质**词与（非纺织品的）**容量/尺寸**数字属于规范要求的内容：该写就写，不要为了规避什么而省略或改写它们。
仍然只返回这个 JSON，不要代码块标记、不要其它文字，不要关键词分析、不要解释、不要备注。`;

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
 * placement = "user" 时就是规范原文本身（第 5 版规范全文）；placement = "system" 时输入框默认为空。
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
 * 自检词表（第 5 版规范只保留禁词一类；材质词/尺寸数字已全部拆除）
 * -------------------------------------------------------------------------- */

/**
 * 禁词表（规范第 4 节）。
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
  // 第 4 节里「与安全、无害含义相近的表达」的常见变体。
  /\bnon-?toxic\b/i,
  /\bharmless\b/i,
];

/** lint 的唯一命中类别（只能标 overLimit 的是长度，不算 lint 命中）。 */
export type ProductTitleLintCategory = "forbidden";

export type ProductTitleLintDetail = {
  category: ProductTitleLintCategory;
  /** 标题里出现的原词（保留原标题大小写）。 */
  term: string;
  /** 在标题中的起始下标（用于按标题顺序输出）。 */
  index: number;
};

export type ProductTitleLintResult = {
  /** 只要命中任一禁词就是 true（材质词/尺寸数字/容量数字**不算**命中）。 */
  hasForbidden: boolean;
  /** 命中的禁词原词（按在标题里出现的先后去重）。 */
  hits: string[];
  /** 分类明细（服务端拼纠正指令用；不直接返回给前端）。 */
  details: ProductTitleLintDetail[];
};

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
 * 本地自检：扫一遍标题，返回命中的**禁词**。
 *
 * 第 5 版规范下只做这一件事：材质词（Microfiber / Stainless Steel …）与尺寸/容量数字（45cm / 500ml …）
 * 是新规范标题结构要求的内容，**合规**，因此既不命中也不触发重写。
 * 纯正则、无副作用、不改写标题；同一位置优先保留更长的命中，同一个词（忽略大小写）只记一次。
 */
export function lintProductTitle(title: string): ProductTitleLintResult {
  const text = typeof title === "string" ? title : "";
  if (!text.trim()) return { hasForbidden: false, hits: [], details: [] };

  const found: ProductTitleLintDetail[] = PRODUCT_TITLE_FORBIDDEN_PATTERNS
    .flatMap((pattern) => collectMatches(text, pattern, "forbidden"))
    .sort((a, b) => (a.index - b.index) || (b.term.length - a.term.length));

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

export type ProductTitleRepairItem = {
  /** 第几条（从 1 开始，与结果区展示顺序一致）。 */
  index: number;
  /** 该条命中的禁词（标题里出现的原词）。 */
  forbiddenHits: readonly string[];
};

export type ProductTitleRepairInput = {
  /** 只列**命中禁词的那几条**（合规的不用重写，避免整批被改动）。 */
  items: readonly ProductTitleRepairItem[];
};

function quoteTerms(terms: readonly string[]): string {
  return terms.map((term) => `"${term}"`).join("、");
}

/**
 * 拼「重写一次」的纠正指令（第 2 次请求的 user 消息）。
 *
 * **只在命中禁词时**才会拼出内容（超长只标注 overLimit，不重写，所以这里没有长度那一段）：
 * 逐条列出**第几条**与命中的**禁词原词**，并明确要求只去掉禁词——
 * 材质词与容量/尺寸数字属于新规范要求的标题结构，重写时不要一并删掉。
 * 末尾再要求仍然是 3 条。
 */
export function buildProductTitleRepairInstruction(input: ProductTitleRepairInput): string {
  const parts: string[] = [];

  for (const item of input.items) {
    const forbidden = [...item.forbiddenHits];
    if (!forbidden.length) continue;
    parts.push(
      `第 ${item.index} 条标题违反了规则：出现了禁词 ${quoteTerms(forbidden)}，`
      + "规范禁止出现禁词（含「安全、无害、认证达标」的近义表达、PFAS/PTFE/PFOA/PFOS 的 Free/Without/Non 类声明、"
      + "以及环保/绿色/天然/可持续等词语及其同义词、近义词和变体）。"
      + "请在不丢失核心产品关键词与搜索覆盖的前提下重写这一条，只去掉这些禁词"
      + "（材质词与容量/尺寸数字是规范要求的标题结构，不要一并删掉），仍然只返回同样的 JSON。",
    );
  }

  if (parts.length) {
    parts.push(
      `本次仍然必须返回 ${PRODUCT_TITLE_MAX_CANDIDATES} 条候选英文标题，JSON 结构与上面完全一致`
      + `（titles 数组长度 = ${PRODUCT_TITLE_MAX_CANDIDATES}，每条都要各自满足规范全部要求）。`,
    );
  }
  return parts.join("\n");
}
