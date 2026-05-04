import { describe, expect, it } from "vitest";
import { buildSafeReplyExcerpt } from "@/lib/agent/formatting";

describe("agent chat formatting", () => {
  it("does not truncate confirmation intro inside markdown emphasis", () => {
    const text = [
      "建议下一步",
      "",
      "请确认以下信息：",
      "",
      "**风格偏好**：写实/卡通/水彩？",
      "",
      "**小猫品种和画面偏好**：例如橘猫、布偶猫、英短，鱼可以是小鱼干、三文鱼或金鱼，画面可以是厨房、餐桌或草地。",
      "",
      "确认后我会开始生成。",
    ].join("\n");

    const excerpt = buildSafeReplyExcerpt(text, 80);
    expect(excerpt).not.toContain("**");
    expect(excerpt).not.toMatch(/\*[._\s]*$/);
    expect(excerpt).toContain("建议下一步");
  });
});
