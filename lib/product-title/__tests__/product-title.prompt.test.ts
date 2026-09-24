import { describe, expect, it } from "vitest";

/**
 * 规范原文常量、上游 messages 拼装与本地 lint 词表的单测（纯函数，不发任何网络请求）。
 *
 * 这里锁住四件事：
 *  1) PRODUCT_TITLE_SPEC 必须是运营给定的 SHEIN 欧洲站规范**原文（第 5 版）**——
 *     逐字等于运营给的规范文件（773 字符 / 1915 字节 / 末尾带换行），含空行、行首缩进、
 *     全角括号与顿号；且规范正文里**不带** JSON 契约（契约必须在 system 消息里）；
 *  2) 新规范的关键要求都在正文里：材质、容量/尺寸、「每条标题超过200个字符但不超过250个字符」、
 *     「生成3条…并说明理由」；
 *  3) 上游 messages 只由 buildProductTitleMessages 拼装：规范放在 system 还是 user
 *     由 PRODUCT_TITLE_SPEC_PLACEMENT 决定（当前默认 "user" = 文本框默认内容），
 *     断言"规范出现在期望的那条消息里"，不写死位置；
 *  4) 新 lint 的边界：**只**认禁词——材质词（Microfiber / Stainless Steel）与尺寸/容量数字
 *     （45cm / 500ml / 2kg / 12 x 8）属于新规范要求的标题结构，**不命中、不触发重写**。
 */

import {
  PRODUCT_TITLE_DEFAULT_DESCRIPTION,
  PRODUCT_TITLE_FORBIDDEN_PATTERNS,
  PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT,
  PRODUCT_TITLE_OUTPUT_FORMAT,
  PRODUCT_TITLE_SPEC,
  PRODUCT_TITLE_SPEC_PLACEMENT,
  PRODUCT_TITLE_SYSTEM_PROMPT,
  buildProductTitleMessages,
  buildProductTitleOperationalNotes,
  buildProductTitleRepairInstruction,
  lintProductTitle,
} from "@/lib/product-title/prompt";
import { PRODUCT_TITLE_MAX_CANDIDATES, PRODUCT_TITLE_MAX_CHARS } from "@/lib/product-title/types";

const SUPPLEMENT = "折叠晾衣架，家用阳台，双层，白色";

/** 规范正文里的第一个小标题（用来断言「规范只出现一次」）。 */
const STRUCTURE_MARKER = "1. 标题结构";

function contentText(message: { content: unknown }): string {
  if (typeof message.content === "string") return message.content;
  return (message.content as Array<{ type: string; text?: string }>)
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

describe("PRODUCT_TITLE_SPEC（SHEIN 欧洲站规范原文（第 5 版），全文仅此一份）", () => {
  it("逐字等于运营给的规范文件：773 字符 / 1915 字节 / 29 行（末尾保留文件里的换行）", () => {
    // 这三个度量是运营给的规范文件的实测值（一个字符变了都会让它们变化）。
    expect(PRODUCT_TITLE_SPEC).toHaveLength(773);
    expect(Buffer.byteLength(PRODUCT_TITLE_SPEC, "utf8")).toBe(1915);
    // 文件末尾有换行 → split("\n") 最后一项是空字符串，共 29 项（28 行正文 + 1）
    expect(PRODUCT_TITLE_SPEC.split("\n")).toHaveLength(29);
    expect(PRODUCT_TITLE_SPEC.endsWith("\n")).toBe(true);
    expect(PRODUCT_TITLE_SPEC.split("\n")[27]).toBe(
      "生成前自行检查：≤250字符、无禁词、无虚构属性、关键词高度相关、英文自然，符合欧洲消费者搜索表达。",
    );
  });

  it("开头第一句与每节小标题逐字保留（含行首缩进、空行与全角标点）", () => {
    expect(PRODUCT_TITLE_SPEC.startsWith(
      "根据我提供的商品名称、图片或商品信息，生成适用于 SHEIN 欧洲跨境电商的英文商品标题。\n\n1. 标题结构：\n",
    )).toBe(true);
    for (const heading of ["1. 标题结构：", "2. SEO要求：", "3. 输出要求：", "4. 禁词："]) {
      expect(PRODUCT_TITLE_SPEC).toContain(heading);
    }
    // 行首 3 空格缩进逐字保留
    expect(PRODUCT_TITLE_SPEC).toContain("\n   纺织品：数量 + ");
    expect(PRODUCT_TITLE_SPEC).toContain("\n   按照欧洲消费者真实英文搜索习惯优化标题。");
    // 空行分隔的两段（一句在缩进行、下一行顶格）也逐字保留
    expect(PRODUCT_TITLE_SPEC).toContain(
      "自然加入与商品高度相关的：\n核心产品关键词、常用搜索词、同义产品词、功能词、用途词、使用场景词、季节词。",
    );
  });

  it("关键要求都在正文里：材质、容量/尺寸、200~250 字符、生成3条…并说明理由", () => {
    // 材质 + 容量/尺寸：新规范的标题结构明确要求它们（因此 lint 不能再因它们改写标题）
    expect(PRODUCT_TITLE_SPEC).toContain(
      "纺织品：数量 + 图案/颜色 + 产品名称 + 风格 + 材质 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节。",
    );
    expect(PRODUCT_TITLE_SPEC).toContain(
      "非纺织品：数量 + 容量/尺寸 + 特点词 + 材质 + 产品名称 + 风格 + 图案/颜色 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节。",
    );
    expect(PRODUCT_TITLE_SPEC).toContain("材质");
    expect(PRODUCT_TITLE_SPEC).toContain("容量/尺寸");
    // 字符要求（全角括号逐字保留）
    expect(PRODUCT_TITLE_SPEC).toContain(
      "每条标题超过200个字符但不超过250个字符（包含空格和标点）",
    );
    // 输出要求：3 条 + 说明理由
    expect(PRODUCT_TITLE_SPEC).toContain("生成3条最好的最符合的欧洲跨境英文标题供选择，并说明理由。");
    expect(PRODUCT_TITLE_SPEC).toContain("说明理由");
    // 禁词（第 4 节）
    expect(PRODUCT_TITLE_SPEC).toContain("禁止出现 Safe、Safety、Quality Verified");
    expect(PRODUCT_TITLE_SPEC).toContain("PFAS、PTFE、PFOA、PFOS");
    expect(PRODUCT_TITLE_SPEC).toContain("可回收");
    expect(PRODUCT_TITLE_SPEC).toContain("海洋友好");
  });

  it("新规范不再禁止材质词/尺寸数字（旧版本那两条禁令已随规范一起消失）", () => {
    expect(PRODUCT_TITLE_SPEC).not.toContain("不要出现任何材质");
    expect(PRODUCT_TITLE_SPEC).not.toContain("不要出现任何尺寸");
    expect(PRODUCT_TITLE_SPEC).not.toContain("材质词");
    expect(PRODUCT_TITLE_SPEC).not.toContain("规格数字");
    // 也不再是「只生成 1 条」
    expect(PRODUCT_TITLE_SPEC).not.toContain("1条英文商品标题");
  });

  it("规范正文里不含 JSON 契约（契约必须留在 system 消息里，不能被用户编辑掉）", () => {
    expect(PRODUCT_TITLE_SPEC).not.toContain("charCount");
    expect(PRODUCT_TITLE_SPEC).not.toContain("为了程序解析");
  });

  it("机器契约：恰好 3 条候选标题 + 逐条中文对照 zh + 只返回 JSON，并显式压过规范正文的冲突要求", () => {
    expect(PRODUCT_TITLE_MAX_CANDIDATES).toBe(3);
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('{"titles":[');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"title":"<英文标题1>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"title":"<英文标题2>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"title":"<英文标题3>"');
    // 每条都必须带中文对照 zh（3 条各一份）
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"zh":"<第1条英文标题的中文对照>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"zh":"<第2条英文标题的中文对照>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"zh":"<第3条英文标题的中文对照>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("charCount");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("必须恰好返回 3 条候选英文标题（titles 数组长度 = 3）");
    // 契约段的优先级：条数 / 输出格式 / 是否需要理由都以它为准
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("本段是给程序解析的**机器契约**");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("一律**以本段为准**");
    // 规范正文说「并说明理由」→ 契约里明确不需要输出理由（避免污染标题与破坏 JSON）
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("规范正文说「并说明理由」");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("**不需要**说明理由");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("不要输出理由、不要输出解释");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("只返回这个 JSON，不要代码块标记、不要其它文字");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("不要关键词分析、不要解释、不要备注");
    // 不能再出现「一句 blanket 地禁止中文翻译」的旧写法（zh 现在是契约要求的字段）
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).not.toContain("不要提供中文翻译、关键词分析、解释、备注或其他内容");
    // 契约里仍然没有卖点角度字段
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).not.toContain('"angle"');
    // 新规范允许材质与容量/尺寸：契约里明说该写就写，别为了规避什么而省略
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("属于规范要求的内容");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("不要为了规避什么而省略或改写它们");
  });

  it("契约把 zh 的定位写清楚：只是该条英文标题的中文对照，且不参与任何合规约束", () => {
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("对应那条英文标题的中文翻译对照");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("供运营阅读，不用于上架");
    // zh 不参与合规：禁词 / ≤250 字符都只针对英文 title
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("zh **不参与任何合规约束**");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("规范第 4 节的禁词");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("只针对英文 title");
    // charCount 只算英文 title 的字符数
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("charCount 指的是**英文 title** 的字符数");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("**不是** zh 的字符数");
    // zh 不是卖点分析 / 关键词解释 / 备注
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("不要写成卖点分析、关键词解释或备注");
  });
});

describe("system 消息（放置位置由常量决定）", () => {
  it("默认放在 user（文本框默认内容），system 只放最小机器契约", () => {
    expect(PRODUCT_TITLE_SPEC_PLACEMENT).toBe("user");
    expect(PRODUCT_TITLE_DEFAULT_DESCRIPTION).toBe(PRODUCT_TITLE_SPEC);

    // 最小契约：角色一句话 + JSON 输出格式；不含规范正文
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).toContain("你是资深跨境电商运营");
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).toContain("为了程序解析");
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).toContain('{"titles":[');
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).toContain('"title"');
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).toContain("charCount");
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).toContain("必须恰好返回 3 条候选英文标题");
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).not.toContain("1. 标题结构");
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).not.toContain("SHEIN");
  });

  it("system 版本 = 规范原文 + 缩进后的输出格式段（切回 system 时不丢任何文本）", () => {
    expect(PRODUCT_TITLE_SYSTEM_PROMPT.startsWith(PRODUCT_TITLE_SPEC)).toBe(true);
    const jsonContract = PRODUCT_TITLE_SYSTEM_PROMPT.slice(PRODUCT_TITLE_SYSTEM_PROMPT.indexOf("为了程序解析"));
    // 输出格式段缩进 2 空格后追加在规范原文之后（不复制字符串，直接从常量拼）
    const indentedContract = PRODUCT_TITLE_OUTPUT_FORMAT.split("\n").map((line) => `  ${line}`).join("\n");
    expect(PRODUCT_TITLE_SYSTEM_PROMPT.endsWith(indentedContract)).toBe(true);
    // slice 从「为了程序解析」开始，第一行丢掉了缩进，其余行保留缩进
    const [firstLine, ...restLines] = PRODUCT_TITLE_OUTPUT_FORMAT.split("\n");
    expect(jsonContract).toBe([firstLine, ...restLines.map((line) => `  ${line}`)].join("\n"));
    expect(jsonContract).toContain('{"titles":[');
  });
});

describe("buildProductTitleMessages（上游 messages 的唯一拼装入口）", () => {
  const textarea = `${PRODUCT_TITLE_DEFAULT_DESCRIPTION}\n\n${SUPPLEMENT}`;

  it("默认（规范在 user）：user 文本 = 文本框全部内容；system 只含最小契约", () => {
    const messages = buildProductTitleMessages({ description: textarea, imageCount: 0 });

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(messages[0].content).toBe(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT);
    expect(messages[0].content).not.toContain(PRODUCT_TITLE_SPEC);

    const userText = contentText(messages[1]);
    expect(userText.startsWith(PRODUCT_TITLE_SPEC)).toBe(true);
    expect(userText).toContain(SUPPLEMENT);
    // 规范只出现一次（不再重复前置）
    expect(userText.split(STRUCTURE_MARKER)).toHaveLength(2);
  });

  it("切到 system 放置：规范进 system，user 只放文本框内容", () => {
    const messages = buildProductTitleMessages({ description: SUPPLEMENT, imageCount: 0, specPlacement: "system" });

    expect(messages[0].content).toBe(PRODUCT_TITLE_SYSTEM_PROMPT);
    expect(String(messages[0].content)).toContain(PRODUCT_TITLE_SPEC);
    const userText = contentText(messages[1]);
    expect(userText).toBe(SUPPLEMENT);
    expect(userText).not.toContain("4. 禁词");
  });

  it("用户改成只有自己的描述时，user 文本就是他的原文（绝不强行回填规范）", () => {
    const messages = buildProductTitleMessages({ description: SUPPLEMENT, imageCount: 0 });
    expect(contentText(messages[1])).toBe(SUPPLEMENT);
  });

  it("多图时只在文本框内容之后追加操作性提示", () => {
    const messages = buildProductTitleMessages({ description: textarea, imageCount: 3 });
    const userText = contentText(messages[1]);
    expect(userText.startsWith(PRODUCT_TITLE_SPEC)).toBe(true);
    expect(userText).toContain(SUPPLEMENT);
    expect(userText).toContain("我提供了 3 张商品图片");
    expect(userText.indexOf(SUPPLEMENT)).toBeLessThan(userText.indexOf("我提供了 3 张商品图片"));
  });

  it("文本框为空（只有图）时给出不编造提示，且不带规范", () => {
    const messages = buildProductTitleMessages({ description: "   ", imageCount: 1 });
    const userText = contentText(messages[1]);
    expect(userText).toContain("文本框为空");
    expect(userText).toContain("不要编造图片里看不到的信息");
    expect(userText).not.toContain("4. 禁词");
    expect(buildProductTitleOperationalNotes({ description: "", imageCount: 1 })).toBe(userText);
  });

  it("图片 data URL 只作为 user 消息的 image part 内联（没有图就是纯字符串）", () => {
    const withImages = buildProductTitleMessages({
      description: SUPPLEMENT,
      imageDataUrls: ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"],
    });
    expect(Array.isArray(withImages[1].content)).toBe(true);
    const parts = withImages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.filter((part) => part.type === "image_url").map((part) => part.image_url?.url)).toEqual([
      "data:image/jpeg;base64,AAA",
      "data:image/jpeg;base64,BBB",
    ]);
    // 图片张数只影响文本提示（排在文本框内容之后），不影响文本框内容本身
    const userText = contentText(withImages[1]);
    expect(userText.startsWith(SUPPLEMENT)).toBe(true);
    expect(userText).toContain("我提供了 2 张商品图片");

    const single = buildProductTitleMessages({
      description: SUPPLEMENT,
      imageDataUrls: ["data:image/jpeg;base64,AAA"],
    });
    expect(contentText(single[1])).toBe(SUPPLEMENT);

    const withoutImages = buildProductTitleMessages({ description: SUPPLEMENT, imageDataUrls: [] });
    expect(typeof withoutImages[1].content).toBe("string");
  });
});

describe("lintProductTitle（本地自检：只认禁词，不改写标题）", () => {
  it("材质词不再命中（新规范要求标题里包含材质）", () => {
    for (const title of [
      "Washable Microfiber Cleaning Head for Floor Mop",
      "Stainless Steel Kitchen Storage Rack",
      "Soft Cotton Bed Sheet Set for Bedroom",
      "Ceramic Coffee Mug with Handle for Office",
    ]) {
      const lint = lintProductTitle(title);
      expect(lint.hasForbidden).toBe(false);
      expect(lint.hits).toEqual([]);
      expect(lint.details).toEqual([]);
    }
  });

  it("尺寸/容量/重量数字与规格组合也不再命中（新规范的标题结构要求容量/尺寸）", () => {
    for (const title of [
      "Adjustable Pole 45cm for Balcony",
      "Space Saving 30 inch Shelf Organizer",
      "500ml Water Spray Bottle",
      "2kg Adjustable Dumbbell",
      "Mat 12 x 8 for Kitchen",
      "Foldable Storage Bags 2-pack for Wardrobe",
    ]) {
      const lint = lintProductTitle(title);
      expect(lint.hasForbidden).toBe(false);
      expect(lint.hits).toEqual([]);
    }
  });

  it("命中禁词（大小写不敏感，保留原标题大小写）", () => {
    expect(lintProductTitle("Eco Friendly Reusable Shopping Bag").hits).toContain("Eco");
    expect(lintProductTitle("Safe Non-Toxic Baby Bib").hits).toEqual(
      expect.arrayContaining(["Safe", "Non-Toxic"]),
    );
    expect(lintProductTitle("100% Recyclable Gift Box").hits.join("|")).toMatch(/Recyclable/i);
    expect(lintProductTitle("PFAS Free Kitchen Pan").hits).toEqual(
      expect.arrayContaining(["PFAS Free", "PFAS"]),
    );
    expect(lintProductTitle("Natural Bamboo Cutting Board").hits.join("|")).toMatch(/Natural/i);
    expect(lintProductTitle("Quality Verified Storage Box").hits.join("|")).toMatch(/Quality Verified/i);
  });

  it("命中类别恒为 forbidden（材质/尺寸没有自己的类别了）", () => {
    const lint = lintProductTitle("Microfiber Mop 45cm with Safe Lock");
    expect(lint.details.map((item) => item.category)).toEqual(["forbidden"]);
    expect(lint.hits).toEqual(["Safe"]);
    expect(lint.hasForbidden).toBe(true);
  });

  it("干净的标题（含材质词与尺寸数字）hits 为空", () => {
    const clean = "Foldable Laundry Drying Rack for Small Balcony, Space Saving Hanger";
    const lint = lintProductTitle(clean);
    expect(lint.hasForbidden).toBe(false);
    expect(lint.hits).toEqual([]);
    expect(lintProductTitle("")).toEqual({ hasForbidden: false, hits: [], details: [] });
    expect(lintProductTitle("Stainless Steel Mop 45cm 500ml").hits).toEqual([]);
  });

  it("同一命中去重（忽略大小写）且按标题顺序返回", () => {
    const lint = lintProductTitle("Safe Microfiber Mop with safe pad, 45cm Handle");
    expect(lint.hits).toEqual(["Safe"]);
    expect(lint.details).toEqual([{ category: "forbidden", term: "Safe", index: 0 }]);
  });

  it("禁词表本身仍然保留（服务端 lint 的唯一词表）", () => {
    expect(PRODUCT_TITLE_FORBIDDEN_PATTERNS.length).toBeGreaterThan(0);
    expect(PRODUCT_TITLE_FORBIDDEN_PATTERNS.every((pattern) => pattern instanceof RegExp)).toBe(true);
  });
});

describe("buildProductTitleRepairInstruction（只在禁词命中时重写一次）", () => {
  it("只命中禁词的那一条：逐字列出「第几条 + 命中原词」，并重申仍是 3 条", () => {
    const message = buildProductTitleRepairInstruction({
      items: [{ index: 1, forbiddenHits: ["Safe"] }],
    });
    const lines = message.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "第 1 条标题违反了规则：出现了禁词 \"Safe\"，"
      + "规范禁止出现禁词（含「安全、无害、认证达标」的近义表达、PFAS/PTFE/PFOA/PFOS 的 Free/Without/Non 类声明、"
      + "以及环保/绿色/天然/可持续等词语及其同义词、近义词和变体）。"
      + "请在不丢失核心产品关键词与搜索覆盖的前提下重写这一条，只去掉这些禁词"
      + "（材质词与容量/尺寸数字是规范要求的标题结构，不要一并删掉），仍然只返回同样的 JSON。",
    );
    expect(lines[1]).toContain(`仍然必须返回 ${PRODUCT_TITLE_MAX_CANDIDATES} 条候选英文标题`);
    expect(lines[1]).toContain(`titles 数组长度 = ${PRODUCT_TITLE_MAX_CANDIDATES}`);
    // 纠正指令里绝不能出现「去掉材质词 / 尺寸数字」这类旧说法
    expect(message).not.toContain("去掉所有材质词");
    expect(message).not.toContain("尺寸/容量/规格数字");
  });

  it("多条命中禁词：逐条写出第几条与命中原词", () => {
    const message = buildProductTitleRepairInstruction({
      items: [
        { index: 2, forbiddenHits: ["Eco"] },
        { index: 3, forbiddenHits: ["Safe", "Recyclable"] },
      ],
    });
    expect(message).toContain('第 2 条标题违反了规则：出现了禁词 "Eco"');
    expect(message).toContain('第 3 条标题违反了规则：出现了禁词 "Safe"、"Recyclable"');
    expect(message.split("\n")).toHaveLength(3);
  });

  it("超长不参与重写（只标注 overLimit）：没有禁词时纠正指令为空字符串", () => {
    expect(buildProductTitleRepairInstruction({ items: [] })).toBe("");
    // 即使调用方把「只超长、无禁词」的条目传进来，也不会拼出任何指令
    expect(buildProductTitleRepairInstruction({ items: [{ index: 1, forbiddenHits: [] }] })).toBe("");
    expect(PRODUCT_TITLE_MAX_CHARS).toBe(250);
  });
});
