import { getPoseSeriesStylePoseLines, type PoseSeriesStyle } from "@/lib/module-style-presets";

export type PoseOutputMode = "grid" | "separate";

export const POSE_QUALITY =
  "photorealistic, commercial fashion photography, sharp face and fabric details, natural skin texture";

export const POSE_LAYOUT_REQUIREMENT =
  "输出方式：生成单张 2x2 四宫格，每格一个姿势；不要拆成多张图。";

export const POSE_SEPARATE_LAYOUT_REQUIREMENT =
  "输出方式：每个姿势单独一张图；当前请求只生成指定姿势，不要四宫格、拼图或分屏。";

export const POSE_CONSISTENCY_REQUIREMENT =
  "一致性：保持图1同一人物、脸、肤色、发型、身体比例、服装、场景、光线和摄影质感。";

export const POSE_SOURCE_ROLE_REQUIREMENT =
  "图1角色：唯一的人物、服装、比例、场景和光线参考；文字只改变姿势、可选镜头和构图。";

export const POSE_PROPORTION_LOCK_RULE =
  "比例锁定：保持图1头身比、头部大小、肩宽、腰胯、四肢长度、脚部大小、腰线和服装穿着尺度；不要拉高拉瘦、长腿化或变体型。";

export const POSE_SERIES_RULE =
  "系列感：像同一套商业时装片的连续姿势系列，风格统一但动作有变化。";

export const POSE_CLOTHING_RULE =
  "服装：保留版型、颜色、图案、材质、腰线、肩线、袖长、下摆和搭配关系；只允许自然褶皱变化。";

export const POSE_BODY_RULE =
  "动作：自然可信，符合真人关节；避免断手、错位手指、肢体拉长、比例漂移和过度瘦身。";

export const POSE_SKIN_COLOR_RULE =
  "肤色：保留图1自然肤色、明暗、冷暖和真实皮肤质感；不要美白、冷白、过曝或粉白滤镜。";

export const POSE_FACE_SHAPE_RULE =
  "脸：保留图1脸型骨相、五官比例和辨识度；不要网红脸、小V脸、尖下巴或过度美颜。";

export const POSE_CREATIVE_VARIATION_RULE =
  "姿势：未逐条指定时，由 AI 按风格自由设计自然、不同、适合展示服装的姿势；不要套模板。";

export const POSE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情：保持同一张脸，允许 AI 按姿势和风格自由发挥自然表情变化；不要夸张或换脸。";

export const POSE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情：尽量保持一致，只允许轻微自然差异；不要夸张或换脸。";

const NEGATIVE_POSE_REQUIREMENT =
  "负面：不要换脸、换衣服、改场景、改服装结构、多余人物、肢体畸形、比例漂移、过度美颜、AI感、文字水印。";

export function enforcePosePromptRequirements(
  prompt: string,
  options: { varyExpression?: boolean; poseStyle?: PoseSeriesStyle; outputMode?: PoseOutputMode } = {}
) {
  if (!prompt.trim()) return "";

  let nextPrompt = prompt
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!/图1/.test(nextPrompt)) {
    nextPrompt = `保持图1的人物身份、服装、场景、光影一致。${nextPrompt}`;
  }

  if (!/图像角色硬规则/.test(nextPrompt)) {
    nextPrompt = `${POSE_SOURCE_ROLE_REQUIREMENT}\n${nextPrompt}`;
  }

  if (options.outputMode === "separate") {
    nextPrompt = removeGridLayoutWording(nextPrompt);
    if (!/每个姿势单独生成一张完整图片|不要生成四宫格/.test(nextPrompt)) {
      nextPrompt = `${POSE_SEPARATE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
    }
  } else if (!/(四宫格|2x2|four-panel|4-panel|contact sheet)/i.test(nextPrompt)) {
    nextPrompt = `${POSE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
  }

  if (!/same face identity|同一张脸|人物身份/.test(nextPrompt)) {
    const consistencyRule = options.outputMode === "separate"
      ? toSeparateOutputRule(POSE_CONSISTENCY_REQUIREMENT)
      : POSE_CONSISTENCY_REQUIREMENT;
    nextPrompt = `${consistencyRule}\n${nextPrompt}`;
  }

  const requiredRules = [
    ["系列感：", POSE_SERIES_RULE],
    ["服装：", POSE_CLOTHING_RULE],
    ["比例锁定：", POSE_PROPORTION_LOCK_RULE],
    ["动作：", POSE_BODY_RULE],
    ["肤色：", POSE_SKIN_COLOR_RULE],
    ["脸：", POSE_FACE_SHAPE_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (!nextPrompt.includes(marker)) {
      const nextRule = options.outputMode === "separate" ? toSeparateOutputRule(rule) : rule;
      nextPrompt = `${nextPrompt}\n${nextRule}`;
    }
  });

  nextPrompt = nextPrompt
    .split("\n")
    .filter((line) => !/表情控制|表情：|表情-|expression variation|facial expression/i.test(line))
    .join("\n")
    .trim();
  const expressionRule = options.varyExpression === false
    ? POSE_EXPRESSION_CONSISTENT_REQUIREMENT
    : POSE_EXPRESSION_VARIATION_REQUIREMENT;
  nextPrompt = `${nextPrompt}\n${options.outputMode === "separate" ? toSeparateOutputRule(expressionRule) : expressionRule}`;

  const poseLines = getPoseSeriesStylePoseLines(options.poseStyle);
  const requiredPoseLines = options.poseStyle === "user_custom" ? [] : poseLines;
  requiredPoseLines.forEach((line, index) => {
    const poseNumber = index + 1;
    if (!new RegExp(`姿势\\s*${poseNumber}`).test(nextPrompt)) {
      nextPrompt = `${nextPrompt}\n${line}`;
    }
  });
  if (options.poseStyle !== "user_custom" && !/AI姿势创作规则/.test(nextPrompt)) {
    const creativeRule = options.outputMode === "separate"
      ? toSeparateOutputRule(POSE_CREATIVE_VARIATION_RULE)
      : POSE_CREATIVE_VARIATION_RULE;
    nextPrompt = `${nextPrompt}\n${creativeRule}`;
  }

  if (!/不要换脸|不要换衣服|不要改变场景/.test(nextPrompt)) {
    nextPrompt = `${nextPrompt}\n${NEGATIVE_POSE_REQUIREMENT}`;
  }

  const missingQuality = POSE_QUALITY
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt}\n${POSE_QUALITY}`;
  }

  return nextPrompt;
}

function removeGridLayoutWording(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/不要生成四宫格|不要生成.*拼图|不要生成.*contact sheet/i.test(line)) return true;
      return !/(四宫格|2x2|four-panel|4-panel|contact sheet|分格|分屏|拼图|pose sheet)/i.test(line);
    })
    .join("\n")
    .trim();
}

function toSeparateOutputRule(rule: string) {
  return rule
    .replace(/四个分格/g, "同组四张独立图片")
    .replace(/四个姿势/g, "四张独立图中的姿势")
    .replace(/同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴/g, "同一套商业时装大片的连续姿势系列，而不是四张风格割裂的照片")
    .replace(/每格/g, "每张图")
    .replace(/四格/g, "四张图")
    .replace(/四宫格/g, "同组独立图");
}
