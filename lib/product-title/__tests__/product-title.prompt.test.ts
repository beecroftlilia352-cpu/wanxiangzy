import { describe, expect, it } from "vitest";

/**
 * 规范原文常量、上游 messages 拼装与本地 lint 词表的单测（纯函数，不发任何网络请求）。
 *
 * 这里锁住三件事：
 *  1) PRODUCT_TITLE_SPEC 必须是运营给定的 SHEIN 欧洲站规范**原文**（含小标题/加粗/空行），
 *     且规范正文里**不带** JSON 契约（契约必须在 system 消息里，避免被用户编辑掉）；
 *  2) 上游 messages 只由 buildProductTitleMessages 拼装：规范放在 system 还是 user
 *     由 PRODUCT_TITLE_SPEC_PLACEMENT 决定（当前默认 "user" = 文本框默认内容），
 *     断言"规范出现在期望的那条消息里"，不写死位置；
 *  3) lint 词表的召回与误报边界（材质词、尺寸/容量数字、禁词；数量词不误报）。
 */

import {
  PRODUCT_TITLE_DEFAULT_DESCRIPTION,
  PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT,
  PRODUCT_TITLE_OUTPUT_FORMAT,
  PRODUCT_TITLE_SPEC,
  PRODUCT_TITLE_SPEC_PLACEMENT,
  PRODUCT_TITLE_SYSTEM_PROMPT,
  buildProductTitleMessages,
  buildProductTitleOperationalNotes,
  buildProductTitleRepairInstruction,
  lintProductTitle,
  productTitleHitsByCategory,
} from "@/lib/product-title/prompt";
import { PRODUCT_TITLE_MAX_CANDIDATES, PRODUCT_TITLE_MAX_CHARS } from "@/lib/product-title/types";

const SUPPLEMENT = "折叠晾衣架，家用阳台，双层，白色";

function contentText(message: { content: unknown }): string {
  if (typeof message.content === "string") return message.content;
  return (message.content as Array<{ type: string; text?: string }>)
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

describe("PRODUCT_TITLE_SPEC（SHEIN 欧洲站规范原文，全文仅此一份）", () => {
  it("规范原文未被改动：1230 字符 / 76 行（§5 的「1条」保持原样）", () => {
    // 这两个数字是用户给定的原文度量；改动规范正文（哪怕一个字）都会让它们变化。
    expect(PRODUCT_TITLE_SPEC).toHaveLength(1230);
    expect(PRODUCT_TITLE_SPEC.split("\n")).toHaveLength(76);
    expect(PRODUCT_TITLE_SPEC.split("\n").filter((line) => line === "只生成 **1条英文商品标题**。")).toHaveLength(1);
    // 契约里要求的 3 条只存在于机器契约段，不在规范正文里
    expect(PRODUCT_TITLE_SPEC).not.toContain("3条");
    expect(PRODUCT_TITLE_SPEC).not.toContain("3 条");
  });

  it("开头是给定的第一句，且 1~7 节小标题齐全", () => {
    expect(PRODUCT_TITLE_SPEC.startsWith(
      "根据我提供的商品名称、商品图片或商品信息，生成适用于 SHEIN 欧洲跨境电商的英文商品标题。",
    )).toBe(true);
    for (const heading of [
      "### 1. 标题结构",
      "### 2. 属性限制",
      "### 3. SEO要求",
      "### 4. 字符要求",
      "### 5. 输出要求",
      "### 6. 禁词",
      "### 7. 生成前强制自检",
    ]) {
      expect(PRODUCT_TITLE_SPEC).toContain(heading);
    }
    expect(PRODUCT_TITLE_SPEC.trimEnd().endsWith("检查完成后，**只输出最终英文标题和字符数。**")).toBe(true);
  });

  it("关键约束串逐字保留（含加粗标记与坐标词）", () => {
    expect(PRODUCT_TITLE_SPEC).toContain("SHEIN");
    expect(PRODUCT_TITLE_SPEC).toContain("**纺织品：**");
    expect(PRODUCT_TITLE_SPEC).toContain(
      "数量 + 图案/颜色 + 产品名称 + 风格/特点 + 形状/细节 + 功能 + 同义产品名称 + 适用场景/节日/季节",
    );
    expect(PRODUCT_TITLE_SPEC).toContain("**标题中不要出现任何材质或材料相关词语。**");
    expect(PRODUCT_TITLE_SPEC).toContain("每条英文标题**不超过250个字符（包含空格和标点）**。");
    expect(PRODUCT_TITLE_SPEC).toContain("只生成 **1条英文商品标题**。");
    expect(PRODUCT_TITLE_SPEC).toContain("禁止出现：");
    expect(PRODUCT_TITLE_SPEC).toContain("PFAS");
  });

  it("规范正文里不含 JSON 契约（契约必须留在 system 消息里，不能被用户编辑掉）", () => {
    expect(PRODUCT_TITLE_SPEC).not.toContain("charCount");
    expect(PRODUCT_TITLE_SPEC).not.toContain("为了程序解析");
    // §5 的「只生成 1条」是用户给的原文：一个字都不改（数量由机器契约覆盖，见下一个用例）
    expect(PRODUCT_TITLE_SPEC).toContain("只生成 **1条英文商品标题**。");
  });

  it("机器契约要求恰好 3 条候选标题、只返回 JSON，并显式覆盖规范正文里的「只生成 1 条」", () => {
    expect(PRODUCT_TITLE_MAX_CANDIDATES).toBe(3);
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('{"titles":[');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"title":"<英文标题1>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"title":"<英文标题2>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain('"title":"<英文标题3>"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("charCount");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("必须恰好返回 3 条候选英文标题（titles 数组长度 = 3）");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("即使规范正文提到只生成 1 条，本接口也要求输出 3 条候选英文标题");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("只返回这个 JSON，不要代码块标记、不要其它文字");
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).toContain("不要提供中文翻译、关键词分析、解释、备注");
    // 契约里没有中文对照/卖点角度字段（结果区也不再展示它们）
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).not.toContain('"zh"');
    expect(PRODUCT_TITLE_OUTPUT_FORMAT).not.toContain('"angle"');
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
    expect(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT).not.toContain("### 1. 标题结构");
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
    expect(userText.split("### 1. 标题结构")).toHaveLength(2);
  });

  it("切到 system 放置：规范进 system，user 只放文本框内容", () => {
    const messages = buildProductTitleMessages({ description: SUPPLEMENT, imageCount: 0, specPlacement: "system" });

    expect(messages[0].content).toBe(PRODUCT_TITLE_SYSTEM_PROMPT);
    expect(String(messages[0].content)).toContain(PRODUCT_TITLE_SPEC);
    const userText = contentText(messages[1]);
    expect(userText).toBe(SUPPLEMENT);
    expect(userText).not.toContain("### 7. 生成前强制自检");
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
    expect(userText).not.toContain("### 1. 标题结构");
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

describe("lintProductTitle（本地自检，不改写标题）", () => {
  it("命中材质词（保留原标题大小写，长词优先）", () => {
    const lint = lintProductTitle("Washable Microfiber Cleaning Head for Floor Mop");
    expect(lint.hasForbidden).toBe(true);
    expect(lint.hits).toContain("Microfiber");

    const steel = lintProductTitle("Stainless Steel Kitchen Storage Rack");
    expect(steel.hits).toContain("Stainless Steel");
    // 长词优先：不该再单独报一个 "Steel"
    expect(steel.hits).not.toContain("Steel");
  });

  it("命中尺寸/容量/重量数字与规格组合", () => {
    expect(lintProductTitle("Adjustable Pole 45cm for Balcony").hits).toContain("45cm");
    expect(lintProductTitle("Space Saving 30 inch Shelf Organizer").hits).toContain("30 inch");
    expect(lintProductTitle("500ml Water Spray Bottle").hits).toContain("500ml");
    expect(lintProductTitle("2kg Adjustable Dumbbell").hits).toContain("2kg");
    expect(lintProductTitle("Mat 12 x 8 for Kitchen").hits.join("|")).toContain("12 x 8");
  });

  it("数量词（2-pack / 2 pcs / 3 pieces）不误报为尺寸", () => {
    for (const title of [
      "Foldable Storage Bags 2-pack for Wardrobe",
      "Reusable Kitchen Cloths 2 pcs Set",
      "Bamboo-free Coasters 3 pieces",
      "Washable Cleaning Cloths 3pcs Pack",
    ]) {
      const lint = lintProductTitle(title);
      expect(lint.details.filter((item) => item.category === "measurement")).toEqual([]);
    }
  });

  it("命中禁词（大小写不敏感）", () => {
    expect(lintProductTitle("Eco Friendly Reusable Shopping Bag").hits).toContain("Eco");
    expect(lintProductTitle("Safe Non-Toxic Baby Bib").hits).toEqual(
      expect.arrayContaining(["Safe", "Non-Toxic"]),
    );
    expect(lintProductTitle("100% Recyclable Gift Box").hits.join("|")).toMatch(/Recyclable/i);
    expect(lintProductTitle("PFAS Free Kitchen Pan").hits).toEqual(
      expect.arrayContaining(["PFAS Free", "PFAS"]),
    );
    expect(lintProductTitle("Natural Bamboo Cutting Board").hits.join("|")).toMatch(/Natural/i);
  });

  it("干净的标题 hits 为空", () => {
    const clean = "Foldable Laundry Drying Rack for Small Balcony, Space Saving Hanger";
    const lint = lintProductTitle(clean);
    expect(lint.hasForbidden).toBe(false);
    expect(lint.hits).toEqual([]);
    expect(lintProductTitle("")).toEqual({ hasForbidden: false, hits: [], details: [] });
  });

  it("同一命中去重且按标题顺序返回，并按类别分组供纠正指令使用", () => {
    const lint = lintProductTitle("Microfiber Mop with microfiber pad, 45cm Handle");
    expect(lint.hits).toEqual(["Microfiber", "45cm"]);
    expect(productTitleHitsByCategory(lint)).toEqual({
      material: ["Microfiber"],
      measurement: ["45cm"],
      forbidden: [],
    });
  });
});

describe("buildProductTitleRepairInstruction", () => {
  it("只命中材质词的那一条：逐字列出「第几条 + 命中原词」，并重申仍是 3 条", () => {
    const message = buildProductTitleRepairInstruction({
      items: [{ index: 1, materialHits: ["Microfiber"], measurementHits: [], forbiddenHits: [], overLimit: false }],
    });
    const lines = message.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      '第 1 条标题违反了规则：出现了材质词 "Microfiber"，且标题不允许出现任何材质或材料相关词语，'
      + "也不允许出现尺寸/容量/规格数字。请在不丢失核心产品关键词与搜索覆盖的前提下重写这一条，"
      + "去掉所有材质词，仍然只返回同样的 JSON。",
    );
    expect(lines[1]).toContain(`仍然必须返回 ${PRODUCT_TITLE_MAX_CANDIDATES} 条候选英文标题`);
    expect(lines[1]).toContain(`titles 数组长度 = ${PRODUCT_TITLE_MAX_CANDIDATES}`);
  });

  it("多条同时不合规：逐条写出第几条、命中原词与类别，并说明要去掉哪些词", () => {
    const message = buildProductTitleRepairInstruction({
      items: [
        { index: 2, materialHits: ["Microfiber"], measurementHits: ["45cm"], forbiddenHits: ["Eco"], overLimit: false },
        { index: 3, materialHits: [], measurementHits: [], forbiddenHits: [], overLimit: true },
      ],
    });
    expect(message).toContain(
      '第 2 条标题违反了规则：出现了材质词 "Microfiber"；出现了尺寸/容量/规格数字 "45cm"；出现了禁词 "Eco"',
    );
    expect(message).toContain("去掉所有材质词、尺寸/容量/规格数字与禁词");
    expect(message).toContain(`第 3 条标题超过 ${PRODUCT_TITLE_MAX_CHARS} 字符`);
    expect(message).toContain(`精简到 ${PRODUCT_TITLE_MAX_CHARS} 字符以内`);
    expect(message.split("\n")).toHaveLength(3);
  });

  it("同一条既命中又超长时，该条的两段指令都要带上", () => {
    const message = buildProductTitleRepairInstruction({
      items: [{ index: 2, materialHits: ["Microfiber"], measurementHits: [], forbiddenHits: [], overLimit: true }],
    });
    expect(message).toContain('第 2 条标题违反了规则：出现了材质词 "Microfiber"');
    expect(message).toContain(`第 2 条标题超过 ${PRODUCT_TITLE_MAX_CHARS} 字符`);
    expect(message.split("\n")).toHaveLength(3);
  });

  it("没有任何不合规的条数时返回空字符串（不发误导性指令）", () => {
    expect(buildProductTitleRepairInstruction({ items: [] })).toBe("");
  });
});
