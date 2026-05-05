import { describe, expect, it } from "vitest";
import { applyPoseSeriesStylePrompt } from "@/lib/module-style-presets";
import { enforcePosePromptRequirements } from "@/lib/pose-prompt";

describe("pose prompt handling", () => {
  it("keeps user custom pose lines instead of replacing them with defaults", () => {
    const prompt = [
      "保持图1原始场景和镜头距离。",
      "镜头统一规则：consistent medium full-body framing, 50mm lens, eye level angle",
      "姿势1：双手插兜，正面站立。",
      "姿势2：左手扶帽檐，身体侧转。",
      "姿势3：右手拿包，轻微迈步。",
      "姿势4：背对镜头回眸，手扶腰。",
    ].join("\n");

    const styled = applyPoseSeriesStylePrompt(prompt, "user_custom");

    expect(styled).toContain("姿势2：左手扶帽檐，身体侧转。");
    expect(styled).toContain("姿势4：背对镜头回眸，手扶腰。");
    expect(styled).not.toContain("一手轻抚头发或整理衣领");
    expect(styled).toContain("不用默认姿势覆盖");
  });

  it("does not append default pose lines during custom prompt enforcement", () => {
    const prompt = [
      "保持图1原始场景和镜头距离。",
      "姿势1：双手插兜，正面站立。",
      "姿势2：左手扶帽檐，身体侧转。",
      "姿势3：右手拿包，轻微迈步。",
      "姿势4：背对镜头回眸，手扶腰。",
    ].join("\n");

    const enforced = enforcePosePromptRequirements(prompt, {
      poseStyle: "user_custom",
      varyExpression: true,
    });

    expect(enforced).toContain("姿势3：右手拿包，轻微迈步。");
    expect(enforced).not.toContain("一手轻抚头发或整理衣领");
    expect(enforced).toContain("比例锁定");
    expect(enforced).toContain("图1角色");
  });

  it("lets preset styles use AI creative pose variation instead of fixed pose scripts", () => {
    const prompt = "保持图1人物、服装和商业摄影质感，生成四宫格姿势裂变。";

    const styled = applyPoseSeriesStylePrompt(prompt, "korean_clean");
    const enforced = enforcePosePromptRequirements(styled, {
      poseStyle: "korean_clean",
      varyExpression: true,
    });

    expect(enforced).toContain("姿势：");
    expect(enforced).toContain("由 AI 按风格自由设计");
    expect(enforced).not.toContain("手指自然整理发丝或衣领");
    expect(enforced).not.toContain("姿势1：正面自然站立");
    expect(enforced).not.toContain("镜头统一规则");
    expect(enforced).not.toContain("consistent clean medium full-body framing");
  });

  it("switches layout wording for separate pose outputs", () => {
    const styled = applyPoseSeriesStylePrompt("保持图1人物和服装，生成四宫格姿势裂变，像连续 pose sheet。", "luxury_lookbook");
    const enforced = enforcePosePromptRequirements(styled, {
      poseStyle: "source_continuity",
      outputMode: "separate",
    });

    expect(enforced).toContain("每个姿势单独一张图");
    expect(enforced).toContain("不要四宫格");
    expect(enforced).not.toContain("必须生成单张图片中的 2x2 四宫格");
    expect(enforced).not.toContain("生成四宫格姿势裂变");
    expect(enforced).not.toContain("四个分格");
    expect(enforced).not.toContain("连续 pose sheet");
    expect(enforced).toContain("姿势裂变拍摄风格档位：轻奢 Lookbook");
  });

  it("makes expression toggle produce clearly different instructions", () => {
    const varying = enforcePosePromptRequirements("保持图1人物和服装，生成姿势变化。", {
      varyExpression: true,
    });
    const consistent = enforcePosePromptRequirements("保持图1人物和服装，生成姿势变化。", {
      varyExpression: false,
    });

    expect(varying).toContain("允许 AI 按姿势和风格自由发挥自然表情变化");
    expect(consistent).toContain("尽量保持一致，只允许轻微自然差异");
    expect(varying).not.toContain("中性、浅笑、自信微笑");
    expect(consistent).not.toContain("同一种自然中性表情");
  });
});
