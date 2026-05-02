export const POSE_QUALITY =
  "photorealistic, 8K ultra-detailed, cinematic color grade, sharp details";

export const POSE_LAYOUT_REQUIREMENT =
  "必须生成单张图片中的 2x2 四宫格 / four-panel pose variation / contact sheet，四个分格分别展示姿势1、姿势2、姿势3、姿势4；不要只生成单人单姿势，不要只生成一张普通照片。";

export const POSE_CONSISTENCY_REQUIREMENT =
  "四个分格必须保持图1同一个人物身份、同一张脸、同一发型、同一身体比例、同一套服装、同一面料纹理、同一颜色图案、同一背景场景、同一光线、同一色调和同一摄影质量。";

export const POSE_CAMERA_REQUIREMENT =
  "四个分格都必须使用 consistent medium full-body framing, 50mm lens, eye level angle；禁止 close-up、特写、wide angle、大广角、high angle、俯拍、low angle、仰拍，避免改变人物比例或服装展示范围。";

const DEFAULT_POSE_LINES = [
  "姿势1：正面自然站立，双手自然下垂或轻触口袋，眼神直视镜头，自信微笑。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势2：身体轻微侧转30度，肩线放松，一手轻抚头发或整理衣领，优雅自然。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势3：重心轻微偏移，一手叉腰或扶腰，另一只手自然下垂，展示服装腰线和廓形。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势4：轻微迈步或转身的自然动态，衣服产生真实褶皱和垂坠，不改变服装结构。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
];

const NEGATIVE_POSE_REQUIREMENT =
  "负面约束：不要换脸，不要换衣服，不要改变场景，不要改变服装结构，不要生成多余人物，不要扭曲手指和肢体，不要塑料皮肤，不要AI渲染感。";

export function enforcePosePromptRequirements(prompt: string) {
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

  if (!/consistent medium full-body framing/.test(nextPrompt)) {
    nextPrompt = `${nextPrompt}\n${POSE_CAMERA_REQUIREMENT}`;
  }

  DEFAULT_POSE_LINES.forEach((line, index) => {
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
