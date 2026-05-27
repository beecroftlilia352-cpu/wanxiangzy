import {
  DEFAULT_POSE_SERIES_STYLE,
  normalizePoseSeriesStyle,
  type PoseSeriesStyle,
} from "@/lib/module-style-presets";
import {
  POSE_VISUAL_BODY_CROP_LABELS,
  fallbackPoseVisualAnalysis,
  normalizePoseVisualAnalysis,
  type PoseVisualAnalysis,
  type PoseVisualBodyCrop,
} from "@/lib/pose-analysis";

export type PosePlanOutputMode = "grid" | "separate";
export type PosePlanSource = "vision_plan" | "fallback" | "cache" | "history" | "user_custom";

export type PoseStylePolicy = {
  style: PoseSeriesStyle;
  intensity: "low" | "medium" | "high";
  cameraFreedom: "source_locked" | "clean_product" | "lookbook" | "editorial";
  motionLevel: "minimal" | "natural" | "expressive";
  productReadability: "strict" | "balanced";
  avoid: string[];
};

export type PoseSlotPlan = {
  index: 1 | 2 | 3 | 4;
  poseName: string;
  bodyAction: string;
  handAction: string;
  headDirection: string;
  cameraFraming: string;
  garmentVisibilityRule: string;
  avoidRules: string[];
  confidence: number;
};

export type PosePlan = {
  version: string;
  style: PoseSeriesStyle;
  outputMode: PosePlanOutputMode;
  slots: PoseSlotPlan[];
  edited: boolean;
};

export const POSE_PLAN_VERSION = "pose-plan-v1";

export type PosePlanContext = {
  poseAnalysis?: PoseVisualAnalysis | null;
  poseStyle?: PoseSeriesStyle;
  outputMode?: PosePlanOutputMode;
  prompt?: string;
};

export function getPoseStylePolicy(value: unknown): PoseStylePolicy {
  const style = normalizePoseSeriesStyle(value);
  if (style === "luxury_white_studio" || style === "ecommerce_clean") {
    return {
      style,
      intensity: "low",
      cameraFreedom: "clean_product",
      motionLevel: "minimal",
      productReadability: "strict",
      avoid: ["dramatic posing", "complex props", "unreadable outfit", "extreme crop"],
    };
  }
  if (style === "source_continuity") {
    return {
      style,
      intensity: "low",
      cameraFreedom: "source_locked",
      motionLevel: "minimal",
      productReadability: "strict",
      avoid: ["new scene", "over-stylized atmosphere", "large motion", "unreadable outfit"],
    };
  }
  if (style === "fashion_editorial" || style === "euro_campaign") {
    return {
      style,
      intensity: "high",
      cameraFreedom: "editorial",
      motionLevel: "expressive",
      productReadability: "balanced",
      avoid: ["unreadable clothing", "extreme body angle", "excessive motion blur", "identity drift"],
    };
  }
  if (style === "luxury_lookbook" || style === "korean_clean" || style === "xiaohongshu_lifestyle") {
    return {
      style,
      intensity: "medium",
      cameraFreedom: "lookbook",
      motionLevel: "natural",
      productReadability: "balanced",
      avoid: ["over-posing", "heavy retouching", "unreadable outfit", "identity drift"],
    };
  }
  return {
    style,
    intensity: "medium",
    cameraFreedom: "lookbook",
    motionLevel: "natural",
    productReadability: "balanced",
    avoid: ["unreadable outfit", "identity drift", "body proportion drift"],
  };
}

export function normalizePosePlan(input: unknown, context: PosePlanContext = {}): PosePlan {
  const fallback = buildFallbackPosePlan(context);
  const record = toRecord(input);
  if (!record) return fallback;
  const rawSlots = Array.isArray(record.slots)
    ? record.slots
    : Array.isArray(record.items)
      ? record.items
      : [];
  const slots = [0, 1, 2, 3].map((slotIndex) => normalizePoseSlotPlan(rawSlots[slotIndex], fallback.slots[slotIndex], slotIndex + 1));
  const style = normalizePoseSeriesStyle(readString(record, "style", "poseStyle", "pose_style") || context.poseStyle || fallback.style);
  const outputMode = normalizeOutputMode(readString(record, "outputMode", "output_mode") || context.outputMode || fallback.outputMode);

  return {
    version: readString(record, "version") || POSE_PLAN_VERSION,
    style,
    outputMode,
    slots,
    edited: readBoolean(record, "edited") ?? fallback.edited,
  };
}

export function buildFallbackPosePlan(context: PosePlanContext = {}): PosePlan {
  const style = normalizePoseSeriesStyle(context.poseStyle || DEFAULT_POSE_SERIES_STYLE);
  const outputMode = normalizeOutputMode(context.outputMode);
  const analysis = normalizePoseVisualAnalysis(context.poseAnalysis) || fallbackPoseVisualAnalysis();
  const policy = getPoseStylePolicy(style);
  const slots = buildFallbackSlots(analysis, policy);

  return {
    version: POSE_PLAN_VERSION,
    style,
    outputMode,
    slots,
    edited: false,
  };
}

export function buildUserCustomPosePlan(input: PosePlanContext & {
  customPosePrompt?: string;
  customCamera?: string;
  customPoses?: string[];
}): PosePlan {
  const fallback = buildFallbackPosePlan({ ...input, poseStyle: "user_custom" });
  const customPoses = Array.isArray(input.customPoses) ? input.customPoses : [];
  const customCamera = clampText(input.customCamera || "", 180);
  const slots = fallback.slots.map((slot, index) => {
    const text = clampText(customPoses[index] || slot.bodyAction, 260);
    return {
      ...slot,
      poseName: `自定义姿势 ${index + 1}`,
      bodyAction: text,
      handAction: "",
      headDirection: "",
      cameraFraming: customCamera || slot.cameraFraming,
      confidence: 1,
    };
  });
  return {
    ...fallback,
    style: "user_custom",
    slots,
    edited: true,
  };
}

export function buildPosePlanCacheKey(input: {
  mainImageUrl?: string | null;
  poseAnalysis?: PoseVisualAnalysis | null;
  poseStyle?: PoseSeriesStyle;
  outputMode?: PosePlanOutputMode;
  prompt?: string;
}) {
  const analysis = normalizePoseVisualAnalysis(input.poseAnalysis);
  return JSON.stringify({
    version: POSE_PLAN_VERSION,
    mainImageUrl: normalizeAnalysisUrl(input.mainImageUrl || ""),
    poseStyle: normalizePoseSeriesStyle(input.poseStyle),
    outputMode: normalizeOutputMode(input.outputMode),
    prompt: clampText(input.prompt || "", 500),
    analysis: analysis ? {
      genderExpression: analysis.genderExpression,
      ageRange: analysis.ageRange,
      bodyCrop: analysis.bodyCrop,
      bodyOrientation: analysis.bodyOrientation,
      poseBaseline: analysis.poseBaseline,
      cameraFraming: analysis.cameraFraming,
      handsVisible: analysis.handsVisible,
      feetVisible: analysis.feetVisible,
      confidence: Math.round(analysis.confidence * 100) / 100,
    } : null,
  });
}

export function getPosePlanSummary(plan: PosePlan | null | undefined) {
  if (!plan) return [];
  return plan.slots.map((slot) => ({
    key: `pose-slot-${slot.index}`,
    title: `姿势${slot.index}：${slot.poseName}`,
    detail: [slot.bodyAction, slot.handAction, slot.headDirection].filter(Boolean).join("；"),
  }));
}

export function buildPosePlanPoseLines(plan: PosePlan | null | undefined) {
  if (!plan) return [];
  return plan.slots.map((slot) => {
    const parts = [
      slot.bodyAction,
      slot.handAction,
      slot.headDirection,
      slot.cameraFraming ? `镜头/构图：${slot.cameraFraming}` : "",
      slot.garmentVisibilityRule ? `服装展示：${slot.garmentVisibilityRule}` : "",
      slot.avoidRules.length ? `避免：${slot.avoidRules.join("、")}` : "",
    ].filter(Boolean);
    return `姿势${slot.index}：${parts.join("；")}。`;
  });
}

export function buildPoseSlotPlanDirective(slot: PoseSlotPlan | null | undefined) {
  if (!slot) return "";
  return [
    "Target pose:",
    `${slot.poseName}.`,
    slot.bodyAction,
    slot.handAction,
    slot.headDirection,
    "",
    "Camera:",
    slot.cameraFraming,
    "",
    "Outfit readability:",
    slot.garmentVisibilityRule,
    "",
    "Avoid:",
    slot.avoidRules.join(", "),
  ].filter(Boolean).join("\n");
}

function buildFallbackSlots(analysis: PoseVisualAnalysis, policy: PoseStylePolicy): PoseSlotPlan[] {
  const crop = analysis.bodyCrop;
  if (crop === "upper_body") return buildUpperBodySlots(policy, analysis);
  if (crop === "lower_body") return buildLowerBodySlots(policy, analysis);
  if (crop === "closeup") return buildCloseupSlots(policy, analysis);
  return buildFullBodySlots(policy, analysis, crop);
}

function buildFullBodySlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis, crop: PoseVisualBodyCrop): PoseSlotPlan[] {
  const strictProduct = policy.productReadability === "strict";
  const expressive = policy.motionLevel === "expressive";
  const natural = policy.motionLevel === "natural";
  const cameraBase = crop === "three_quarter" ? "保持七分身或近全身范围，重要服装部位不要被裁掉" : "保持头脚完整或接近完整的服装展示范围";
  const garmentRule = strictProduct
    ? "正面、侧面、腰线、袖口、裤脚/裙摆和整体廓形必须清楚"
    : "保持服装廓形、腰线、袖口、下摆和面料垂坠清楚";
  const avoid = buildAvoidRules(policy, analysis);

  return [
    createSlot(1, "正面服装展示", "正面自然站立，重心轻微变化，不复制源图站姿", "手部自然垂放、轻触衣摆或整理袖口", "视线自然看向镜头或轻微偏离", `${cameraBase}，构图干净稳定`, garmentRule, avoid, 0.62),
    createSlot(2, "三分之二侧身展示", "身体转为三分之二侧身，展示侧面轮廓、肩线和服装厚度", "一只手可轻触衣领、袖口或口袋附近", "头颈和肩膀保持同一自然方向", `${cameraBase}，允许轻微偏中心留白`, garmentRule, avoid, 0.62),
    createSlot(3, strictProduct ? "站定细节展示" : "站定造型变化", strictProduct ? "站定重心偏移，突出腰线、衣摆和面料垂坠" : "站定造型，肩线、腰胯和身体重心更有层次", "手部做克制的服装整理动作，避免夸张摆拍", "表情自然，头部方向跟随身体", expressive ? "高级 editorial 构图，但不要极端裁切" : `${cameraBase}，可略微拉近`, garmentRule, avoid, 0.62),
    createSlot(4, expressive ? "轻微动态转身" : natural ? "自然轻动作" : "轻微转身展示", expressive ? "小幅迈步或自然转身，动作有张力但身体稳定" : "轻微迈步、侧转或自然转身，动作幅度小且可信", "手臂随身体自然摆动或轻触服装边缘", "头、颈、肩、躯干保持一致方向，不单独回头", `${cameraBase}，允许方向性留白`, garmentRule, avoid, 0.62),
  ];
}

function buildUpperBodySlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis): PoseSlotPlan[] {
  const avoid = buildAvoidRules(policy, analysis);
  const garmentRule = "领口、肩线、袖型、胸前图案、上衣版型和面料纹理必须清楚";
  const camera = policy.cameraFreedom === "source_locked"
    ? "保持图1上半身裁切和镜头距离"
    : "保持上半身或半身商业构图，不扩成全身";
  return [
    createSlot(1, "上半身正面展示", "上半身正面自然姿态，肩颈放松，躯干轻微重心变化", "手部可轻触衣摆上缘、袖口或自然入画", "视线自然看向镜头", camera, garmentRule, avoid, 0.6),
    createSlot(2, "上半身侧向展示", "肩膀和躯干转为三分之二侧向，展示侧面肩线和衣身厚度", "一只手可整理领口或袖口", "头颈跟随肩膀方向，避免独立回望", camera, garmentRule, avoid, 0.6),
    createSlot(3, "上半身细节造型", "躯干轻微倾斜或重心变化，突出领口、肩线和面料层次", "手部靠近服装细节但不遮挡关键图案", "表情自然克制", camera, garmentRule, avoid, 0.6),
    createSlot(4, "上半身轻微转动", "肩颈和躯干做小幅自然转动，制造轻微动态感", "手臂自然带动袖口和衣摆产生可信褶皱", "视线与身体方向一致", camera, garmentRule, avoid, 0.6),
  ];
}

function buildLowerBodySlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis): PoseSlotPlan[] {
  const avoid = buildAvoidRules(policy, analysis);
  const garmentRule = "腰部、胯部、腿部线条、裤脚/裙摆、面料垂坠和下装长度必须清楚";
  const camera = policy.cameraFreedom === "source_locked"
    ? "保持图1下半身裁切和镜头距离"
    : "保持下半身局部商业构图，不扩成完整人像";
  return [
    createSlot(1, "下装正面展示", "下半身正面站姿，重心轻微变化，展示腰胯和裤管/裙摆正面", "", "", camera, garmentRule, avoid, 0.58),
    createSlot(2, "下装侧面展示", "腿部和胯部转为侧向或三分之二侧向，展示侧缝、垂坠和厚度", "", "", camera, garmentRule, avoid, 0.58),
    createSlot(3, "下装站定重心", "站定重心偏移，一侧膝部自然放松，突出下摆和面料张力", "", "", camera, garmentRule, avoid, 0.58),
    createSlot(4, "下装轻微步态", "小幅迈步或自然转身，展示运动褶皱和裤脚/裙摆动态", "", "", camera, garmentRule, avoid, 0.58),
  ];
}

function buildCloseupSlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis): PoseSlotPlan[] {
  const avoid = buildAvoidRules(policy, analysis);
  const garmentRule = "局部服装结构、纹理、图案、开口位置和边缘细节必须清楚";
  const camera = policy.cameraFreedom === "source_locked"
    ? "保持图1局部近景裁切和镜头距离"
    : "保持局部近景商业构图，不扩成无关全身照";
  return [
    createSlot(1, "局部正向细节", "保持局部正向展示，轻微改变角度突出结构边缘", "手部仅在图1允许时自然辅助展示", "", camera, garmentRule, avoid, 0.56),
    createSlot(2, "局部侧向细节", "局部转为侧向或斜向展示，突出厚度、缝线和面料层次", "避免遮挡主要纹理", "", camera, garmentRule, avoid, 0.56),
    createSlot(3, "局部质感变化", "通过小幅姿态和褶皱变化展示材质、垂坠和张力", "动作保持克制", "", camera, garmentRule, avoid, 0.56),
    createSlot(4, "局部轻微动态", "局部产生轻微自然动态，展示边缘和面料运动感", "不要制造夸张变形", "", camera, garmentRule, avoid, 0.56),
  ];
}

function buildAvoidRules(policy: PoseStylePolicy, analysis: PoseVisualAnalysis) {
  const rules = [
    ...policy.avoid,
    "face change",
    "outfit change",
    "body proportion drift",
    "twisted neck",
    "broken limbs",
  ];
  if (analysis.genderExpression === "male") {
    rules.push("male-to-female change", "feminized body", "gendered makeup change");
  } else if (analysis.genderExpression === "female") {
    rules.push("female-to-male change", "masculinized body frame");
  } else {
    rules.push("gender expression drift");
  }
  if (analysis.bodyCrop === "upper_body") {
    rules.push("full-body expansion", "invented lower body");
  }
  if (analysis.bodyCrop === "lower_body") {
    rules.push("full portrait expansion", "invented upper body");
  }
  if (analysis.bodyCrop === "closeup") {
    rules.push("wide shot expansion");
  }
  return Array.from(new Set(rules)).slice(0, 10);
}

function createSlot(
  index: number,
  poseName: string,
  bodyAction: string,
  handAction: string,
  headDirection: string,
  cameraFraming: string,
  garmentVisibilityRule: string,
  avoidRules: string[],
  confidence: number
): PoseSlotPlan {
  return {
    index: Math.min(Math.max(index, 1), 4) as 1 | 2 | 3 | 4,
    poseName,
    bodyAction,
    handAction,
    headDirection,
    cameraFraming,
    garmentVisibilityRule,
    avoidRules,
    confidence,
  };
}

function normalizePoseSlotPlan(input: unknown, fallback: PoseSlotPlan, fallbackIndex: number): PoseSlotPlan {
  const record = toRecord(input);
  if (!record) return { ...fallback, index: fallbackIndex as 1 | 2 | 3 | 4 };
  const confidence = Number(record.confidence);
  return {
    index: fallbackIndex as 1 | 2 | 3 | 4,
    poseName: clampText(readString(record, "poseName", "pose_name", "name", "title", "summary", "姿势名", "名称") || fallback.poseName),
    bodyAction: clampText(readString(record, "bodyAction", "body_action", "action", "body", "body_pose", "movement", "description", "动作", "身体动作", "姿势描述") || fallback.bodyAction, 260),
    handAction: clampText(readString(record, "handAction", "hand_action", "hands", "hand", "hand_pose", "手部", "手部动作") || fallback.handAction, 220),
    headDirection: clampText(readString(record, "headDirection", "head_direction", "gaze", "head", "face", "头部", "头部方向", "视线") || fallback.headDirection, 220),
    cameraFraming: clampText(readString(record, "cameraFraming", "camera_framing", "camera", "framing", "composition", "镜头", "构图", "取景") || fallback.cameraFraming, 220),
    garmentVisibilityRule: clampText(readString(record, "garmentVisibilityRule", "garment_visibility_rule", "outfit", "garment", "garment_rule", "visibility", "服装展示", "服装可读性") || fallback.garmentVisibilityRule, 240),
    avoidRules: normalizeStringArray(record.avoidRules ?? record.avoid_rules ?? record.avoid ?? record.negative ?? record.禁忌 ?? record.避免, 10, 90, fallback.avoidRules),
    confidence: Number.isFinite(confidence) ? clamp(confidence, 0, 1) : fallback.confidence,
  };
}

function normalizeOutputMode(value: unknown): PosePlanOutputMode {
  return value === "separate" ? "separate" : "grid";
}

function normalizeAnalysisUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return String(value || "").split("?")[0].trim().toLowerCase();
  }
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number, fallback: string[] = []) {
  const values = Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? clampText(item, maxLength) : "").filter(Boolean)
    : fallback;
  return Array.from(new Set(values)).slice(0, maxItems);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clampText(value: string, maxLength = 180) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
