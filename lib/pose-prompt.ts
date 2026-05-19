import {
  POSE_SERIES_STYLES,
  buildPoseSeparateStylePresetPrompt,
  getPoseSeriesStylePoseLines,
  type PoseSeriesStyle,
} from "@/lib/module-style-presets";

export type PoseOutputMode = "grid" | "separate";

export const POSE_QUALITY =
  "photorealistic, 8K ultra-detailed, commercial fashion editorial quality, cinematic color grade, sharp facial details, sharp fabric texture, raw photo quality";

export const POSE_LAYOUT_REQUIREMENT =
  "必须生成单张图片中的 2x2 四宫格 / four-panel pose variation / contact sheet，四个分格分别展示姿势1、姿势2、姿势3、姿势4；不要只生成单人单姿势，不要只生成一张普通照片，不要把四个姿势拆成多张独立图片。";

export const POSE_SEPARATE_LAYOUT_REQUIREMENT =
  "输出方式：当前请求只生成一张 3:4 单人完整图片；不要四宫格、拼图、分屏、边框、编号文字或 contact sheet。";

export const POSE_CONSISTENCY_REQUIREMENT =
  "四个分格必须保持图1同一个人物身份、同一张脸、同一脸型骨相、同一自然肤色、同一发型、同一身体比例、同一套服装、同一面料纹理、同一颜色图案、同一背景场景、同一光线、同一色调和同一摄影质量。";

export const POSE_SOURCE_ROLE_REQUIREMENT =
  "图1角色：唯一的人物、服装、比例、场景和光线参考；文字只改变姿势、可选镜头和构图。";

export const POSE_CAMERA_REQUIREMENT =
  "四个分格都必须使用同一个风格档位下的统一镜头语言，保持同一相机距离、同一焦段、同一视平线和同一画幅留白；允许在 50mm / 70mm / 85mm 中按风格选择一致焦段，但禁止 close-up、特写、wide angle、大广角、high angle、俯拍、low angle、仰拍，避免改变人物比例或服装展示范围。";

export const POSE_PROPORTION_LOCK_RULE =
  "比例锁定：保持图1头身比、头部大小、肩宽、腰胯、四肢长度、脚部大小、腰线和服装穿着尺度；不要拉高拉瘦、长腿化或变体型。";

export const POSE_SERIES_RULE =
  "时装大片连贯性规则：四个分格必须像同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴；保持统一构图、统一背景、统一光线、统一肤色质感、统一色彩管理和统一服装展示尺度。";

export const POSE_CLOTHING_RULE =
  "服装展示规则：四个姿势都要清楚展示同一套服装的版型、腰线、肩线、袖长、下摆、面料垂坠、纹理和图案；允许动作造成自然褶皱、遮挡和张力变化，但绝不能改变服装结构、颜色、图案、长度、开口位置或搭配关系。";

export const POSE_BODY_RULE =
  "身体动作规则：动作变化要自然、可信、符合真人关节运动，保留图1或自然商业模特的真实头身比例、肩宽、腰胯比例、四肢长度和体态；避免夸张扭腰、断手、错位手指、肢体拉长、腿被拉长、头被缩小、身体比例漂移或过度瘦身。";

export const POSE_SKIN_COLOR_RULE =
  "肤色和色彩规则：四个分格必须保留图1人物的自然肤色、肤色明暗、冷暖调、局部红润、阴影层次和真实皮肤质感；保持准确白平衡和真实曝光，不要自动美白、不要雪白皮、不要冷白皮、不要过度提亮肤色，不要把画面统一调成过曝白亮或粉白滤镜。";

export const POSE_FACE_SHAPE_RULE =
  "脸型五官规则：四个分格必须保持图1人物的脸型骨相、脸长宽比例、颧骨、下颌线、下巴形状、眼型、眼距、鼻翼宽度、唇形和真实五官辨识度；不要自动变成标准鹅蛋脸、小V脸、尖下巴、大眼高鼻的网红脸。";

export const POSE_CREATIVE_VARIATION_RULE =
  "姿势：未逐条指定时，由 AI 按风格自由设计自然、不同、适合展示服装的姿势；不要套模板。";

export const POSE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情规则：保持同一个人、同一张脸、不要换脸；允许按不同姿势产生轻微自然的眼神和表情变化，避免复制粘贴脸或僵硬同脸。不要夸张表情，不要改变五官身份。";

export const POSE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情规则：保持同一个人、同一张脸、不要换脸；允许按不同姿势产生轻微自然的眼神和表情变化，避免复制粘贴脸或僵硬同脸。不要夸张表情，不要改变五官身份。";

const POSE_SINGLE_IMAGE_CONSISTENCY_REQUIREMENT =
  "当前单张图片以图1作为人物身份、服装、背景和光线参考；优先让姿势明显变化，同时保持同一套服装设计、颜色、图案、面料质感、自然脸部身份、肤色和真实身体比例。";

const POSE_SINGLE_IMAGE_CAMERA_REQUIREMENT =
  "当前单张图片允许相机距离、身体角度和画面留白随目标姿势自然调整；保持时装全身或七分身展示，避免 close-up、特写、wide angle、大广角、俯拍、仰拍或夸张透视。";

const POSE_SINGLE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情规则：保持图1同一个人和同一张脸；允许当前姿势产生轻微自然的眼神和表情变化。不要夸张表情，不要改变五官身份，不要复制成僵硬表情。";

const POSE_SINGLE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情规则：保持图1同一个人和同一张脸；允许当前姿势产生轻微自然的眼神和表情变化。不要夸张表情，不要改变五官身份，不要复制成僵硬表情。";

const POSE_SEPARATE_BASE_PROMPT = [
  "Use the source image only for the same person, face, hairstyle, outfit, fabric, color, pattern, background mood, lighting mood and overall fashion-photo style.",
  "Do not use the source image as the pose reference. Do not copy the original pose.",
  "",
  "Generate one standalone premium womenswear fashion photo.",
  "The target pose and camera direction must be clearly executed and noticeably different from the source image.",
  "",
  "Keep the outfit commercially readable, including neckline, shoulder line, sleeve shape, waistline, hem, lower garment and shoes if visible in the source image.",
  "",
  "Keep:",
  "same person, same face identity, same hairstyle, same outfit design, same fabric texture, same color and pattern, same background mood, same lighting mood, natural skin tone, realistic body proportions.",
  "",
  "Negative:",
  "no outfit change, no face change, no extra person, no text, no logo, no watermark, no grid, no collage, no distorted hands, no broken limbs, no unrealistic body shape.",
].join("\n");

const DEFAULT_POSE_LINES = [
  "姿势1：正面服装展示方向；AI 可自由选择自然手势、重心、视线、表情和镜头语言，服装正面轮廓必须清楚。",
  "姿势2：侧身或三分之二侧身展示方向；AI 可自由选择头发/衣领/袖口/衣摆手势、腿部节奏、视线和镜头语言，侧面轮廓和肩线必须清楚。",
  "姿势3：站定造型方向，不要走路；AI 可自由选择扶腰、胯部、肩线、手部造型、视线和镜头语言，腰线、廓形和面料垂坠必须清楚。",
  "姿势4：动态行走、转身或回眸方向，不要静态扶腰；AI 可自由选择步态、手臂运动、身体转向、视线和镜头语言，服装运动褶皱和垂坠必须清楚。",
];

const NEGATIVE_POSE_REQUIREMENT =
  "负面约束：不要换脸，不要换衣服，不要改变场景，不要改变服装结构，不要生成多余人物，不要扭曲手指和肢体，不要身体比例漂移，不要自动美白，不要雪白皮或冷白皮，不要标准鹅蛋脸或小V脸，不要塑料皮肤，不要AI渲染感，不要文字水印。";

export function enforcePosePromptRequirements(
  prompt: string,
  options: { poseStyle?: PoseSeriesStyle; outputMode?: PoseOutputMode } = {}
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

  if (!/图1角色|图像角色硬规则/.test(nextPrompt)) {
    nextPrompt = `${POSE_SOURCE_ROLE_REQUIREMENT}\n${nextPrompt}`;
  }

  if (options.outputMode === "separate") {
    nextPrompt = normalizeSeparatePromptScope(removeGridLayoutWording(nextPrompt));
    if (!/当前请求只生成一张|不要四宫格|不要生成四宫格/.test(nextPrompt)) {
      nextPrompt = `${POSE_SEPARATE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
    }
  } else if (!/(四宫格|2x2|four-panel|4-panel|contact sheet)/i.test(nextPrompt)) {
    nextPrompt = `${POSE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
  }

  if (!/same face identity|同一张脸|人物身份/.test(nextPrompt)) {
    const consistencyRule = options.outputMode === "separate"
      ? POSE_SINGLE_IMAGE_CONSISTENCY_REQUIREMENT
      : POSE_CONSISTENCY_REQUIREMENT;
    nextPrompt = `${consistencyRule}\n${nextPrompt}`;
  }

  const requiredRules = [
    ["时装大片连贯性规则", POSE_SERIES_RULE],
    ["服装展示规则", POSE_CLOTHING_RULE],
    ["身体动作规则", POSE_BODY_RULE],
    ["肤色和色彩规则", POSE_SKIN_COLOR_RULE],
    ["脸型五官规则", POSE_FACE_SHAPE_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (options.outputMode === "separate" && marker === "时装大片连贯性规则") return;
    if (!nextPrompt.includes(marker)) {
      const nextRule = options.outputMode === "separate" ? toSinglePoseRule(rule) : rule;
      nextPrompt = `${nextPrompt}\n${nextRule}`;
    }
  });

  nextPrompt = nextPrompt
    .split("\n")
    .filter((line) => !/表情控制|表情：|表情-|expression variation|facial expression/i.test(line))
    .join("\n")
    .trim();
  const expressionRule = options.outputMode === "separate"
    ? "表情规则：保持图1同一个人和同一张脸；允许当前姿势产生轻微自然的眼神和表情变化。不要夸张表情，不要改变五官身份，不要复制成僵硬表情。"
    : "表情规则：保持同一个人、同一张脸、不要换脸；允许按不同姿势产生轻微自然的眼神和表情变化，避免复制粘贴脸或僵硬同脸。不要夸张表情，不要改变五官身份。";
  nextPrompt = `${nextPrompt}\n${expressionRule}`;

  if (!/consistent .*medium full-body framing|consistent medium full-body framing/i.test(nextPrompt)) {
    const cameraRule = options.outputMode === "separate"
      ? POSE_SINGLE_IMAGE_CAMERA_REQUIREMENT
      : POSE_CAMERA_REQUIREMENT;
    nextPrompt = `${nextPrompt}\n${cameraRule}`;
  }

  const poseLines = getPoseSeriesStylePoseLines(options.poseStyle);
  const requiredPoseLines = options.poseStyle === "user_custom" ? [] : poseLines.length ? poseLines : DEFAULT_POSE_LINES;
  requiredPoseLines.forEach((line, index) => {
    const poseNumber = index + 1;
    if (!new RegExp(`姿势\\s*${poseNumber}`).test(nextPrompt)) {
      nextPrompt = `${nextPrompt}\n${line}`;
    }
  });

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

export function buildSeparatePoseSlotDirective(poseIndex: number, poseStyle?: PoseSeriesStyle) {
  const safeIndex = Math.min(Math.max(Math.floor(Number(poseIndex) || 1), 1), 4);
  const directives = getSeparatePoseSlotDirectives(poseStyle);
  return directives[safeIndex - 1];
}

export function buildSeparatePosePrompt(
  prompt: string,
  poseIndex: number,
  poseStyleOverride?: PoseSeriesStyle,
  styleSourcePrompt = prompt
) {
  const explicitPosePattern = new RegExp(`^\\s*姿势\\s*${poseIndex}[：:]`, "m");
  const poseStyle = poseStyleOverride || inferPoseStyleFromPrompt(prompt);
  const explicitPoseLines = extractExplicitPoseLines(prompt);
  const currentPoseLine = explicitPoseLines.find((line) => explicitPosePattern.test(line));
  const slotDirective = buildSeparatePoseSlotDirective(poseIndex, poseStyle);
  const targetPose = currentPoseLine && poseStyle === "user_custom"
    ? buildCustomSeparatePoseSlotPrompt(sanitizeSeparatePoseLine(currentPoseLine))
    : slotDirective;
  const stylePrompt = buildPoseSeparateStylePresetPrompt(
    poseStyle,
    extractCustomSeparateStyleDirection(styleSourcePrompt)
  );
  const supplementLines = extractSeparatePoseSupplementLines(prompt);

  return [
    POSE_SEPARATE_BASE_PROMPT,
    stylePrompt,
    targetPose,
    ...supplementLines,
  ].filter(Boolean).join("\n");
}

function extractSeparatePoseSupplementLines(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^补充要求[：:]/.test(line))
    .map((line) => line.length > 360 ? `${line.slice(0, 360)}...` : line);
}

function extractCustomSeparateStyleDirection(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^姿势\s*[1-4][：:]/.test(line))
    .filter((line) => !/^补充要求[：:]/.test(line))
    .filter((line) => !line.includes("姿势裂变拍摄风格档位"))
    .join("\n")
    .trim()
    .slice(0, 600);
}

function extractExplicitPoseLines(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^姿势\s*[1-4][：:]/.test(line));
}

function buildCustomSeparatePoseSlotPrompt(targetPose: string) {
  return [
    "Target pose:",
    targetPose,
    "",
    "Camera:",
    "AI may choose the most suitable premium womenswear framing, crop, distance, composition and negative space for this target pose.",
    "Keep head, body and important clothing details readable.",
  ].join("\n");
}

function sanitizeSeparatePoseLine(line: string) {
  return line
    .replace(/镜头[：:].*$/i, "")
    .replace(/consistent medium full-body framing/gi, "medium full-body fashion photo")
    .replace(/same camera distance|same lens style|统一构图|统一镜头语言|同一相机距离|同一焦段|同一画幅留白/gi, "")
    .trim();
}

function inferPoseStyleFromPrompt(prompt: string): PoseSeriesStyle | undefined {
  const markerMatch = prompt.match(/姿势裂变拍摄风格档位：([^。\n]+)/);
  if (!markerMatch) return undefined;
  const label = markerMatch[1].trim();
  return POSE_SERIES_STYLES.find((style) => label.includes(style.label))?.value;
}

function getSeparatePoseSlotDirectives(poseStyle?: PoseSeriesStyle) {
  const defaultDirectives = [
    [
      "Target pose:",
      "Relaxed front-view outfit read.",
      "Keep the front silhouette clear.",
      "Do not reuse the exact original stance.",
      "Change at least two details from the source pose: hand placement, weight shift, gaze direction, torso angle or expression.",
      "",
      "Camera:",
      "Clean full-body product/editorial framing.",
      "Balanced centered composition.",
      "Keep the full outfit clearly readable.",
      "",
      "Expression:",
      "Calm natural expression, relaxed eyes, soft direct gaze.",
    ].join("\n"),
    [
      "Target pose:",
      "Strong three-quarter or side-angle outfit read.",
      "The body must clearly read as side or three-quarter view, not front-facing.",
      "Show side silhouette, shoulder line, sleeve shape, waist thickness, fabric drape and hem profile.",
      "Not a waist-pose shot.",
      "",
      "Camera:",
      "Full-body or 7/8-body three-quarter fashion framing.",
      "Slight off-center composition with clean negative space.",
      "Emphasize side silhouette while keeping the outfit readable.",
      "",
      "Expression:",
      "Soft slight smile, gaze slightly away from camera.",
    ].join("\n"),
    [
      "Target pose:",
      "Stationary confident shape pose.",
      "Emphasize waist, hip line, shoulder attitude and elegant womenswear styling.",
      "Feet stay planted.",
      "One hand may rest on waist, touch the outfit edge, adjust sleeve or hold a natural styling gesture.",
      "Not walking.",
      "Not strong side-angle.",
      "",
      "Camera:",
      "Full-body or 7/8-body premium editorial framing.",
      "Slightly closer than Slot 1.",
      "Focus on waistline, body proportion and upper outfit structure.",
      "Do not crop important outfit parts.",
      "",
      "Expression:",
      "Confident editorial gaze, relaxed lips, subtle chin lift.",
    ].join("\n"),
    [
      "Target pose:",
      "Light movement or soft turning pose.",
      "Use a small step, gentle body turn, or subtle over-shoulder motion.",
      "Do not create a large walking stride or exaggerated motion.",
      "Keep the movement elegant, controlled and feminine.",
      "Show a slight sense of motion through body turn, soft arm movement, and natural fabric drape.",
      "The outfit must remain clearly readable and refined.",
      "",
      "Camera:",
      "Elegant full-body or 7/8-body movement framing.",
      "Allow slight directional negative space.",
      "Keep the body visually stable and balanced.",
      "Avoid aggressive action framing, extreme stride, strong street-style walking energy, excessive motion blur or extreme crop.",
      "",
      "Expression:",
      "Soft candid expression or gentle over-shoulder gaze.",
      "Natural, relaxed, slightly lively, but not exaggerated.",
    ].join("\n"),
  ];

  void poseStyle;
  return defaultDirectives;
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

function normalizeSeparatePromptScope(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/^姿势\s*[1-4][：:]/.test(line)) return true;
      return !/(单图裂变规则|单张生产线分镜|本组四张|生产线四槽计划|用户自定义四槽计划|全组差异校验|其它槽位|其他槽位|同组四张|四张独立图|四张独立图片)/.test(line);
    })
    .map((line) => /^姿势\s*[1-4][：:]/.test(line) ? line : toSinglePoseRule(line))
    .map(removeSeparateCameraLockWording)
    .join("\n")
    .trim();
}

function removeSeparateCameraLockWording(line: string) {
  return line
    .replace(/镜头[：:].*?(consistent medium full-body framing|same camera distance|same lens style).*$/i, "镜头：medium full-body fashion photo, eye-level camera")
    .replace(/same camera distance|same lens style|consistent framing/gi, "")
    .replace(/统一构图、?/g, "")
    .replace(/统一镜头语言、?/g, "")
    .replace(/同一相机距离、?/g, "")
    .replace(/同一焦段、?/g, "")
    .replace(/同一画幅留白、?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toSinglePoseRule(rule: string) {
  return rule
    .replace(/同组四张独立图片都必须/g, "当前单张图片必须")
    .replace(/同组四张独立图片/g, "当前单张图片")
    .replace(/四张独立图中的姿势/g, "当前姿势")
    .replace(/四张独立图片/g, "当前单张图片")
    .replace(/四张独立图/g, "当前单张图片")
    .replace(/四个分格必须/g, "当前单张图片必须")
    .replace(/四个分格/g, "当前单张图片")
    .replace(/四个姿势都要/g, "当前单张图片必须")
    .replace(/四个姿势/g, "当前姿势")
    .replace(/四格/g, "当前单张图片")
    .replace(/每格/g, "当前单张图片")
    .replace(/同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴/g, "图1延展出来的同一套商业时装大片画面")
    .replace(/同一套商业时装大片的连续姿势系列，而不是四张风格割裂的照片/g, "图1延展出来的同一套商业时装大片画面")
    .replace(/同组独立图/g, "当前单张图片")
    .replace(/四宫格/g, "单图");
}
