import { getPoseSeriesStylePoseLines, type PoseSeriesStyle } from "@/lib/module-style-presets";

export const POSE_QUALITY =
  "photorealistic, 8K ultra-detailed, commercial fashion editorial quality, cinematic color grade, sharp facial details, sharp fabric texture, raw photo quality";

export const POSE_LAYOUT_REQUIREMENT =
  "必须生成单张图片中的 2x2 四宫格 / four-panel pose variation / contact sheet，四个分格分别展示姿势1、姿势2、姿势3、姿势4；不要只生成单人单姿势，不要只生成一张普通照片，不要把四个姿势拆成多张独立图片。";

export const POSE_CONSISTENCY_REQUIREMENT =
  "四个分格必须保持图1同一个人物身份、同一张脸、同一脸型骨相、同一自然肤色、同一发型、同一身体比例、同一套服装、同一面料纹理、同一颜色图案、同一背景场景、同一光线、同一色调和同一摄影质量。";

export const POSE_CAMERA_REQUIREMENT =
  "四个分格都必须使用同一个风格档位下的统一镜头语言，保持同一相机距离、同一焦段、同一视平线和同一画幅留白；允许在 50mm / 70mm / 85mm 中按风格选择一致焦段，但禁止 close-up、特写、wide angle、大广角、high angle、俯拍、low angle、仰拍，避免改变人物比例或服装展示范围。";

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

export const POSE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情控制：保持同一个人、同一张脸、不要换脸，但四个分格需要轻微自然的表情差异，避免复制粘贴脸；建议分别呈现平静自然、自信微笑、柔和浅笑、专注或轻微回眸的眼神表情。不要夸张表情，不要改变五官身份。";

export const POSE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情控制：四个分格保持接近一致的自然表情，只允许极轻微的眼神和嘴角变化；不要夸张表情，不要改变五官身份。";

const DEFAULT_POSE_LINES = [
  "姿势1：正面自然站立，双手自然下垂或轻触口袋，表情平静自然，眼神直视镜头，完整展示服装正面版型。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势2：身体轻微侧转30度，肩线放松，一手轻抚头发或整理衣领，柔和浅笑，展示服装侧面轮廓和肩颈线条。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势3：重心轻微偏移，一手叉腰或扶腰，另一只手自然下垂，自信微笑，展示服装腰线、廓形和面料垂坠。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势4：轻微迈步或转身的自然动态，专注或轻微回眸的自然表情，衣服产生真实褶皱、张力和垂坠，不改变服装结构。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
];

const NEGATIVE_POSE_REQUIREMENT =
  "负面约束：不要换脸，不要换衣服，不要改变场景，不要改变服装结构，不要生成多余人物，不要扭曲手指和肢体，不要身体比例漂移，不要自动美白，不要雪白皮或冷白皮，不要标准鹅蛋脸或小V脸，不要塑料皮肤，不要AI渲染感，不要文字水印。";

export function enforcePosePromptRequirements(
  prompt: string,
  options: { varyExpression?: boolean; poseStyle?: PoseSeriesStyle } = {}
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

  if (!/(四宫格|2x2|four-panel|4-panel|contact sheet)/i.test(nextPrompt)) {
    nextPrompt = `${POSE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
  }

  if (!/same face identity|同一张脸|人物身份/.test(nextPrompt)) {
    nextPrompt = `${POSE_CONSISTENCY_REQUIREMENT}\n${nextPrompt}`;
  }

  const requiredRules = [
    ["时装大片连贯性规则", POSE_SERIES_RULE],
    ["服装展示规则", POSE_CLOTHING_RULE],
    ["身体动作规则", POSE_BODY_RULE],
    ["肤色和色彩规则", POSE_SKIN_COLOR_RULE],
    ["脸型五官规则", POSE_FACE_SHAPE_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (!nextPrompt.includes(marker)) nextPrompt = `${nextPrompt}\n${rule}`;
  });

  nextPrompt = nextPrompt
    .split("\n")
    .filter((line) => !/表情控制|expression variation|facial expression/i.test(line))
    .join("\n")
    .trim();
  nextPrompt = `${nextPrompt}\n${options.varyExpression === false ? POSE_EXPRESSION_CONSISTENT_REQUIREMENT : POSE_EXPRESSION_VARIATION_REQUIREMENT}`;

  if (!/consistent .*medium full-body framing|consistent medium full-body framing/i.test(nextPrompt)) {
    nextPrompt = `${nextPrompt}\n${POSE_CAMERA_REQUIREMENT}`;
  }

  const poseLines = getPoseSeriesStylePoseLines(options.poseStyle);
  const requiredPoseLines = poseLines.length ? poseLines : DEFAULT_POSE_LINES;
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
