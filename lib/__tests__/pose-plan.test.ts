import { describe, expect, it } from "vitest";
import {
  buildFallbackPosePlan,
  buildUserCustomPosePlan,
  getPosePlanSummary,
  normalizePosePlan,
} from "@/lib/pose-plan";

describe("pose plan", () => {
  it("normalizes invalid input by filling four fallback slots", () => {
    const plan = normalizePosePlan({ slots: [{ poseName: "Only one", bodyAction: "Front pose" }] }, {
      poseStyle: "ecommerce_clean",
      outputMode: "separate",
    });

    expect(plan.slots).toHaveLength(4);
    expect(plan.slots[0].poseName).toBe("Only one");
    expect(plan.slots[1].poseName).toBeTruthy();
    expect(plan.outputMode).toBe("separate");
  });

  it("keeps upper-body fallback away from foot and shoe actions", () => {
    const plan = buildFallbackPosePlan({
      poseStyle: "korean_clean",
      poseAnalysis: {
        bodyCrop: "upper_body",
        genderExpression: "female",
        ageRange: "adult",
        personVisible: true,
        personCount: 1,
        bodyOrientation: "",
        headDirection: "",
        poseBaseline: "",
        cameraFraming: "",
        cameraAngle: "",
        outfitDescription: "",
        hairDescription: "",
        faceIdentityNotes: "",
        skinToneNotes: "",
        background: "",
        lighting: "",
        handsVisible: true,
        feetVisible: false,
        occlusionNotes: "",
        generationRisks: [],
        promptNotes: "",
        confidence: 0.8,
      },
    });
    const actionText = plan.slots.map((slot) => [slot.bodyAction, slot.handAction, slot.cameraFraming].join(" ")).join(" ");

    expect(actionText).not.toMatch(/foot|feet|shoe|脚|鞋/i);
  });

  it("keeps lower-body fallback away from face and head actions", () => {
    const plan = buildFallbackPosePlan({
      poseStyle: "luxury_white_studio",
      poseAnalysis: {
        bodyCrop: "lower_body",
        genderExpression: "unknown",
        ageRange: "adult",
        personVisible: true,
        personCount: 1,
        bodyOrientation: "",
        headDirection: "",
        poseBaseline: "",
        cameraFraming: "",
        cameraAngle: "",
        outfitDescription: "",
        hairDescription: "",
        faceIdentityNotes: "",
        skinToneNotes: "",
        background: "",
        lighting: "",
        handsVisible: false,
        feetVisible: true,
        occlusionNotes: "",
        generationRisks: [],
        promptNotes: "",
        confidence: 0.8,
      },
    });
    const actionText = plan.slots.map((slot) => [slot.bodyAction, slot.handAction, slot.headDirection].join(" ")).join(" ");

    expect(actionText).not.toMatch(/face|head|expression|脸|头|表情/i);
  });

  it("does not use feminine language for male fallback plans", () => {
    const plan = buildFallbackPosePlan({
      poseStyle: "euro_campaign",
      poseAnalysis: {
        bodyCrop: "full_body",
        genderExpression: "male",
        ageRange: "adult",
        personVisible: true,
        personCount: 1,
        bodyOrientation: "",
        headDirection: "",
        poseBaseline: "",
        cameraFraming: "",
        cameraAngle: "",
        outfitDescription: "",
        hairDescription: "",
        faceIdentityNotes: "",
        skinToneNotes: "",
        background: "",
        lighting: "",
        handsVisible: true,
        feetVisible: true,
        occlusionNotes: "",
        generationRisks: [],
        promptNotes: "",
        confidence: 0.8,
      },
    });

    expect(JSON.stringify(plan).toLowerCase()).not.toContain("feminine");
    expect(JSON.stringify(plan).toLowerCase()).not.toContain("womenswear");
  });

  it("uses the legacy stable four-pose logic for full-body fallback", () => {
    const plan = buildFallbackPosePlan({
      poseStyle: "korean_clean",
      poseAnalysis: {
        bodyCrop: "full_body",
        genderExpression: "female",
        ageRange: "adult",
        personVisible: true,
        personCount: 1,
        bodyOrientation: "",
        headDirection: "",
        poseBaseline: "",
        cameraFraming: "",
        cameraAngle: "",
        outfitDescription: "",
        hairDescription: "",
        faceIdentityNotes: "",
        skinToneNotes: "",
        background: "",
        lighting: "",
        handsVisible: true,
        feetVisible: true,
        occlusionNotes: "",
        generationRisks: [],
        promptNotes: "",
        confidence: 0.8,
      },
    });

    expect(plan.slots.map((slot) => slot.poseName)).toEqual([
      "正面服装展示",
      "侧身或三分之二侧身展示",
      "站定造型",
      "轻微迈步或自然转身",
    ]);
    expect(plan.slots[0].bodyAction).toContain("AI 可自由选择自然手势、重心、视线、表情和镜头语言");
    expect(plan.slots[3].bodyAction).toContain("不要静态扶腰");
  });

  it("turns user custom poses into an edited pose plan", () => {
    const plan = buildUserCustomPosePlan({
      poseStyle: "user_custom",
      customCamera: "clean medium framing",
      customPoses: ["姿势1：双手插兜", "姿势2：侧身整理衣领", "姿势3：站定扶腰", "姿势4：轻微迈步"],
    });

    expect(plan.style).toBe("user_custom");
    expect(plan.edited).toBe(true);
    expect(plan.slots[1].bodyAction).toContain("侧身整理衣领");
    expect(plan.slots[0].cameraFraming).toContain("clean medium framing");
  });

  it("accepts common Chinese slot keys from model output", () => {
    const plan = normalizePosePlan({
      slots: [
        { "姿势名": "自然侧身", "身体动作": "三分之二侧身站立", "手部动作": "轻触衣领", "头部方向": "视线随身体侧转", "构图": "半身商业构图", "服装展示": "肩线和领口清楚", confidence: 0.9 },
        { "姿势名": "正面展示", "身体动作": "正面站定", "手部动作": "自然下垂", "头部方向": "看向镜头", "构图": "全身构图", "服装展示": "整体廓形清楚", confidence: 0.9 },
        { "姿势名": "细节展示", "身体动作": "重心轻偏", "手部动作": "整理袖口", "头部方向": "自然偏头", "构图": "略近景", "服装展示": "袖口清楚", confidence: 0.9 },
        { "姿势名": "轻动作", "身体动作": "小幅迈步", "手部动作": "手臂自然摆动", "头部方向": "随身体方向", "构图": "留白稳定", "服装展示": "动态褶皱清楚", confidence: 0.9 },
      ],
    });

    expect(plan.slots[0].poseName).toBe("自然侧身");
    expect(plan.slots[0].bodyAction).toBe("三分之二侧身站立");
    expect(plan.slots[0].garmentVisibilityRule).toBe("肩线和领口清楚");
  });

  it("accepts direct array pose plans and confidence labels", () => {
    const plan = normalizePosePlan([
      { poseName: "正面展示", bodyAction: "正面站定", confidence: "high" },
      { poseName: "侧身展示", bodyAction: "三分之二侧身", confidence: "medium" },
      { poseName: "重心变化", bodyAction: "站定重心轻偏", confidence: "82%" },
      { poseName: "轻微动态", bodyAction: "小幅转身", confidence: 78 },
    ]);

    expect(plan.slots[0].poseName).toBe("正面展示");
    expect(plan.slots[0].confidence).toBeGreaterThan(0.8);
    expect(plan.slots[1].confidence).toBeGreaterThan(0.6);
    expect(plan.slots[2].confidence).toBe(0.82);
    expect(plan.slots[3].confidence).toBe(0.78);
  });

  it("accepts pose list aliases from model output", () => {
    const plan = normalizePosePlan({
      poses: [
        { poseName: "正面展示", bodyAction: "正面站定" },
        { poseName: "侧身展示", bodyAction: "三分之二侧身" },
        { poseName: "重心变化", bodyAction: "站定重心轻偏" },
        { poseName: "轻微动态", bodyAction: "小幅转身" },
      ],
    });

    expect(plan.slots.map((slot) => slot.poseName)).toEqual(["正面展示", "侧身展示", "重心变化", "轻微动态"]);
  });

  it("accepts Chinese pose list aliases from model output", () => {
    const plan = normalizePosePlan({
      "姿势列表": [
        { "姿势名": "正面展示", "身体动作": "正面站定" },
        { "姿势名": "侧身展示", "身体动作": "三分之二侧身" },
        { "姿势名": "重心变化", "身体动作": "站定重心轻偏" },
        { "姿势名": "轻微动态", "身体动作": "小幅转身" },
      ],
    });

    expect(plan.slots.map((slot) => slot.poseName)).toEqual(["正面展示", "侧身展示", "重心变化", "轻微动态"]);
  });

  it("localizes English model output in user-facing summaries", () => {
    const plan = normalizePosePlan({
      slots: [
        { poseName: "Confident front stance with relaxed shoulders", bodyAction: "standing tall, shoulders relaxed, weight slightly on one leg, torso facing front", confidence: 0.9 },
        { poseName: "Side angle with one leg forward", bodyAction: "turn body slightly 20-30 degrees to one side, keep upright posture, shift weight", confidence: 0.9 },
        { poseName: "Editorial walk-free pose", bodyAction: "standing in a paused stride: one foot slightly forward with heel down, knees relaxed", confidence: 0.9 },
        { poseName: "Powerful open posture", bodyAction: "upright stance, chest lifted, arms slightly away from body for a confident look", confidence: 0.9 },
      ],
    });

    const summary = getPosePlanSummary(plan);
    expect(summary[0].title).toBe("姿势1：正面服装展示");
    expect(summary[0].detail).toContain("正面自然站立");
    expect(summary[1].title).toBe("姿势2：侧身角度展示");
    expect(summary[1].detail).toContain("身体轻微侧转");
    expect(summary[2].detail).toContain("站定跨步造型");
    expect(summary[3].detail).toContain("挺拔开放站姿");
    const visibleText = summary.map((item) => `${item.title}${item.detail}`).join("");
    expect(visibleText).not.toMatch(/[A-Za-z]{4,}/);
  });
});
