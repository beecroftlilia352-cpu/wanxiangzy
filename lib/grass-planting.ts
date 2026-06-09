import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";

export type GrassTemplateId =
  | "atmosphere"
  | "street"
  | "mirror"
  | "home"
  | "elevator"
  | "fitting"
  | "cafe"
  | "fuji"
  | "canon"
  | "hat";

export type GrassSceneMode = "system_reference" | "upload_reference" | "custom_prompt";
export type GrassSceneBackgroundMode = "reference_scene" | "similar_style";

export type GrassRuleDemo = {
  title: string;
  description: string;
  imageUrl: string;
};

export type GrassTemplate = {
  id: GrassTemplateId;
  name: string;
  desc: string;
  imageUrl: string;
  prompt: string;
};

export type GrassPromptReference = {
  title: string;
  text: string;
};

export const GRASS_PROMPT_REFERENCES: GrassPromptReference[] = [
  {
    title: "通勤质感",
    text: "适合上班通勤和周末约会，画面干净高级，突出衣服挺括版型、显瘦比例和不费力的精致感。",
  },
  {
    title: "松弛日常",
    text: "自然松弛的日常出门照，像朋友随手拍，强调舒适、好穿、显气色，动作不要僵硬。",
  },
  {
    title: "甜酷街拍",
    text: "偏甜酷街拍氛围，城市街区自然光，突出穿搭层次、腿部比例和衣服的潮流感。",
  },
  {
    title: "温柔氛围",
    text: "温柔干净的生活方式照片，浅色背景、柔和光线，突出面料柔软、颜色清爽、亲和力强。",
  },
  {
    title: "买家秀真实感",
    text: "真实买家秀分享感，不要过度精修，保留自然皮肤纹理和真实褶皱，衣服细节要清晰可信。",
  },
];

export const GRASS_UPLOAD_RULE = {
  title: "请按规则上传图片，以达到最佳效果",
  uploadSpecText: "图片大小20KB~15MB之间，分辨率大于400*400，格式支持jpg/jpeg/png/webp",
  demos: [
    { title: "平铺图", description: "主体完整、服装清晰的平铺图", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/j9rQ7qVD/grass-demo-flat-1-ebc4675d04.png" },
    { title: "人台图", description: "人台展示图，适合迁移版型", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/5hRgQJzd/grass-demo-mannequin-701a21db50.jpg" },
    { title: "上身图", description: "真人上身图，适合保持穿搭关系", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/Qj6qJK7t/grass-demo-worn-1-7db098ec05.jpg" },
    { title: "平铺图", description: "单品主体完整、边缘清楚", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/d46hhSpV/grass-demo-flat-2-f4ced1bee6.jpg" },
    { title: "上身图", description: "自然上身图，适合种草场景", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/hJL4mRMd/grass-demo-worn-2-0ee3dc97a2.jpg" },
  ] satisfies GrassRuleDemo[],
  badExamples: [
    { title: "商品被遮挡", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/fdMjhgpX/pose-rule-bad-occluded-ae34483e1d.png" },
    { title: "图片不清晰", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/FbQqxjBv/garment-3d-rule-bad-blurry-58a6cb9ef9.png" },
    { title: "拍摄灯光暗", imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/WWKpW4Hf/grass-bad-dark-6497e069c3.png" },
  ],
} as const;

export const GRASS_TEMPLATES: GrassTemplate[] = [
  {
    id: "atmosphere",
    name: "氛围美图",
    desc: "生活方式封面感，适合做首图",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/DgDJjMjm/grass-template-atmosphere-939274b5bb.png",
    prompt:
      "高质感服装种草氛围图，干净生活方式场景，柔和自然光，画面有真实社媒分享美感；主体服装清楚，背景只做氛围衬托。",
  },
  {
    id: "street",
    name: "街道拍摄",
    desc: "城市街拍，自然出门感",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/hRfvVCJT/grass-template-street-0923eafda0.png",
    prompt:
      "时尚街区街拍，午后自然光，轻微城市背景虚化，模特自然行走或站立，像真实出门穿搭分享；构图要突出穿搭比例。",
  },
  {
    id: "mirror",
    name: "对镜自拍",
    desc: "真实用户分享，保留穿搭完整",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/psR27Tz/grass-template-mirror-f65a95c3ac.png",
    prompt:
      "室内对镜自拍风格，手机镜面构图，自然室内光，穿搭完整可见，像真实用户分享照；不要挡住服装关键细节。",
  },
  {
    id: "home",
    name: "居家拍摄",
    desc: "松弛柔和，适合舒适单品",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/N6q4TN3f/grass-template-home-7a7bb48ff1.png",
    prompt:
      "居家生活方式场景，温暖自然光，干净室内背景，松弛站姿或坐姿，突出日常穿搭的舒适感和亲和力。",
  },
  {
    id: "elevator",
    name: "电梯自拍",
    desc: "竖版全身，强种草内容感",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/LXX2bTJL/grass-template-elevator-e67dea3659.png",
    prompt:
      "电梯镜面自拍风格，竖版构图，真实手机拍摄感，穿搭完整展示，画面干净高级；不要让手机或手臂遮挡主体服装。",
  },
  {
    id: "fitting",
    name: "试衣间自拍",
    desc: "真实试穿，细节清楚",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/BVx1nX9J/grass-template-fitting-9b2035e45e.png",
    prompt:
      "试衣间自拍场景，柔和室内灯光，全身镜构图，服装细节清楚，像真实试穿分享；强调尺码、版型和上身效果。",
  },
  {
    id: "cafe",
    name: "咖啡店",
    desc: "温暖松弛，小红书常用场景",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/MkdRfRyM/grass-template-cafe-57b0186cf7.png",
    prompt:
      "咖啡店门口或窗边种草照，午后光影，温暖色调，自然姿态，适合小红书穿搭分享；背景有生活气但不抢主体。",
  },
  {
    id: "fuji",
    name: "富士滤镜",
    desc: "胶片感，柔和清透",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/svQGKQsk/grass-template-fuji-1e8f9b45b2.png",
    prompt:
      "富士胶片色彩质感，轻微颗粒，清透自然肤色，柔和高光；保持真实服装颜色与材质，不要过度滤镜化。",
  },
  {
    id: "canon",
    name: "佳能人像",
    desc: "商业人像，画质清晰",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/sdMVRCsK/grass-template-canon-2feaa41a21.png",
    prompt:
      "佳能商业人像摄影风格：清透明亮的 Canon 色彩，肤色自然红润不过白，白平衡准确，服装边缘和面料纹理自然清晰；使用 50mm/85mm 人像镜头感，浅景深但服装主体完整清楚，画面有干净高级的商业种草质感。",
  },
  {
    id: "hat",
    name: "帽子遮脸",
    desc: "氛围穿搭，弱化脸部",
    imageUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/67ZffwGp/grass-template-hat-e6cd2c3908.png",
    prompt:
      "帽子或手部轻微遮脸的氛围穿搭照，保持神秘感和高级感；服装主体必须完整清楚，脸部弱化但人体结构自然。",
  },
];

export function normalizeGrassTemplate(value: unknown): GrassTemplateId {
  return GRASS_TEMPLATES.some((item) => item.id === value) ? value as GrassTemplateId : "street";
}

export function normalizeGrassSceneMode(value: unknown): GrassSceneMode {
  if (value === "system_reference" || value === "upload_reference" || value === "custom_prompt") {
    return value;
  }
  return "system_reference";
}

export function normalizeGrassSceneBackgroundMode(value: unknown): GrassSceneBackgroundMode {
  return value === "similar_style" ? "similar_style" : "reference_scene";
}

export function getGrassTemplate(templateId: GrassTemplateId) {
  return GRASS_TEMPLATES.find((item) => item.id === templateId) || GRASS_TEMPLATES[1];
}

const GRASS_HARD_RULE_MARK = "【种草硬规则】";
const GRASS_SOURCE_TONE_RULE =
  "源图主体保真：图1人物和服装保持固有色、自然肤色、服装材质、图案/logo、颗粒/噪点和真实相机质感；允许为贴合参考图滤镜观感、曝光反差和新场景做自然的整体氛围/融合匹配，但不要把图1服装或人物过度重调色、HDR、提高 clarity、提高局部反差、额外锐化或商业精修化。";
const GRASS_FINE_TEXTURE_SAFETY_RULE =
  "细密纹理安全：细条纹、罗纹、针织、裤纹、网纱、格纹、logo/文字和重复图案只按图1可见尺度自然保留；不要增强成摩尔纹、波纹、水波纹、频闪条纹、振荡线、假纤维或不存在的面料纹理。";

function buildGrassHardRule(params: {
  sceneMode: GrassSceneMode;
  hasReference: boolean;
  changeModel: boolean;
  sceneBackgroundMode?: GrassSceneBackgroundMode;
}) {
  const sceneBackgroundMode = normalizeGrassSceneBackgroundMode(params.sceneBackgroundMode);
  const modelRule = params.changeModel
    ? "可以更换模特身份、脸型、发型和气质，但新模特必须穿图1同一件衣服/同一套穿搭。"
    : "如果图1有人物，保留图1人物身份、脸型、五官、发型、肤色、身材比例和气质。";

  const referenceRule = params.hasReference && params.sceneMode !== "custom_prompt"
    ? sceneBackgroundMode === "similar_style"
      ? "图2只作为场景风格参考：提取场景类型、空间层次、光线方向、阴影软硬、色彩滤镜、曝光反差、相机质感、镜头、构图节奏、姿势气质和社媒氛围；AI 必须重新生成同类但不同的背景场景，不要复刻图2的具体地点、店招文字、建筑外观、室内陈设、墙面图案、地标、品牌标识或可识别版权元素。不要复制图2的人物、脸、发型、肤色、主体服装、鞋子和整套穿搭。"
      : "图2只参考场景、背景空间、光线、色彩、镜头、构图、姿势和社媒氛围；不要复制图2的人物、脸、发型、肤色、主体服装、鞋子和整套穿搭。可按图1风格添加少量自然配饰，但不能遮挡服装卖点。"
    : "没有图2参考图时，场景和拍摄氛围只根据模板或用户文字生成。";

  return `${GRASS_HARD_RULE_MARK}
图1是唯一服装/穿搭来源。必须保留图1服装的品类、版型、颜色、图案/logo、面料纹理、领口、袖口、下摆、长短、口袋、纽扣/拉链和穿搭层次。
${modelRule}
${referenceRule}
${GRASS_SOURCE_TONE_RULE}
${GRASS_FINE_TEXTURE_SAFETY_RULE}
如果图2或文字风格与图1服装还原冲突，优先还原图1服装。`;
}

export function enforceGrassPromptRequirements(prompt: string, params: {
  sceneMode: GrassSceneMode;
  hasReference: boolean;
  changeModel: boolean;
  sceneBackgroundMode?: GrassSceneBackgroundMode;
}) {
  const normalized = prompt.trim();
  if (!normalized) return buildGrassHardRule(params);
  if (normalized.includes(GRASS_HARD_RULE_MARK)) return normalized;
  return `${buildGrassHardRule(params)}

${normalized}`;
}

export function buildGrassPrompt(params: {
  templateId: GrassTemplateId;
  userPrompt: string;
  changeModel: boolean;
  sceneMode: GrassSceneMode;
  hasReference: boolean;
  referenceName?: string;
  sceneBackgroundMode?: GrassSceneBackgroundMode;
}) {
  const template = getGrassTemplate(params.templateId);
  const isCustom = params.sceneMode === "custom_prompt";
  const sceneBackgroundMode = normalizeGrassSceneBackgroundMode(params.sceneBackgroundMode);
  const useSimilarScene = params.hasReference && !isCustom && sceneBackgroundMode === "similar_style";
  const hardRule = buildGrassHardRule({
    sceneMode: params.sceneMode,
    hasReference: params.hasReference,
    changeModel: params.changeModel,
    sceneBackgroundMode,
  });
  const trimmedUserPrompt = params.userPrompt.trim();
  const userPrompt = trimmedUserPrompt;
  const modelRule = isCustom
    ? "用户自定义模式不追加固定模特规则；模特、背景、构图和姿势以用户自定义文字提示词为准。"
    : params.changeModel
    ? "允许更换为新的真实商业模特，但新模特必须穿图1同一件服装/同一套穿搭。"
    : "不要更换模特身份；如果图1有人物，保持同一人物的脸型、肤色、发型、身材比例和气质。";
  const sceneRule = params.hasReference && !isCustom
    ? `图像角色：图1是服装/穿搭来源；图2是场景参考（${params.referenceName || template.name}）。图2只提供场景、构图、姿势、光线和内容氛围，不提供服装、鞋包、人物身份或整套穿搭。`
    : isCustom
    ? "图像角色：图1是服装/穿搭来源。当前为用户自定义模式，不假设存在图2，场景、模特、背景、构图和姿势以用户文字为准。"
    : "图像角色：图1是服装/穿搭来源。场景、姿势、背景、构图和拍摄氛围按系统模板与补充文字执行。";
  const presetStyleRule = !isCustom && params.sceneMode === "system_reference"
    ? `系统预设风格（必须执行）：${template.name}。${template.prompt} 输出必须明显呈现该预设的摄影风格、色彩倾向、光线质感、镜头语言和社媒氛围；图2是该预设的视觉参考，文字预设和图2需要共同生效。`
    : !isCustom && params.sceneMode === "upload_reference"
    ? useSimilarScene
      ? "上传参考图风格（必须执行）：以图2的场景类型、姿势气质、构图节奏、镜头距离、光线方向、阴影形状、色彩滤镜、曝光反差和照片氛围为准，但背景必须由 AI 重新设计为相似风格的新场景，不额外套用系统预设模板风格。"
      : "上传参考图风格（必须执行）：以图2的姿势、场景、构图、背景、镜头距离、光线方向和照片氛围为准，不额外套用系统预设模板风格。"
    : "";
  const sceneBackgroundRule = useSimilarScene
    ? "场景控制：生成与图2同风格、同氛围、同拍摄语言的相似场景；保留图2的滤镜观感、光影方向、阴影软硬、明暗反差和相机质感，但不要一比一复刻图2背景。重新组合空间、道具、背景元素和光影细节，避免出现图2相同的店名、招牌文字、地标、建筑立面、墙面装饰、室内陈设、品牌标识或可识别版权元素。"
    : params.hasReference && !isCustom
    ? "场景控制：参考图可以直接决定场景、背景空间、光线、构图和社媒氛围。"
    : "";
  const directionRule = params.hasReference && !isCustom
    ? params.sceneMode === "system_reference"
      ? useSimilarScene
        ? `参考执行：提取图2的“${template.name}”摄影风格与场景气质，生成同类但不同的背景；服装和穿搭只来自图1。`
        : `参考执行：画面氛围接近图2，并呈现“${template.name}”风格；服装和穿搭只来自图1。`
      : useSimilarScene
      ? "参考执行：场景类型、姿势气质、构图节奏、镜头距离、光线、阴影、滤镜和照片氛围接近图2，但背景细节、地点、招牌、陈设和可识别元素必须重新生成；服装和穿搭只来自图1。"
      : "参考执行：场景、姿势、构图、镜头距离、光线和照片氛围接近图2；服装和穿搭只来自图1。"
    : !isCustom
    ? `系统模板执行：${template.prompt}`
    : `用户自定义执行：${userPrompt}`;
  const referenceNegative = params.hasReference && !isCustom
    ? useSimilarScene
      ? "，不要照搬图2人物、鞋包配饰、整套穿搭、背景细节、店招文字、地标、建筑/室内陈设或可识别地点"
      : "，不要照搬图2人物、鞋包配饰或整套穿搭"
    : "";

  return `${hardRule}

服装种草图生成任务。
${sceneRule}
目标：生成真实、自然、有购买欲的服装种草图，适合小红书、社媒和电商内容。
${presetStyleRule}
${sceneBackgroundRule}
${directionRule}
${!isCustom && userPrompt ? `补充文字提示：${userPrompt}` : ""}

	必须执行的生成规则：
	保留图1服装的版型、颜色、图案/logo、面料、长短、领口、袖口、下摆、口袋、纽扣/拉链和穿搭层次。
	服装产品保真：图1服装按商品资产处理，锁定固有色、图案/logo 和面料表面；场景氛围、滤镜和社媒风格不能重绘服装材质。
	${GRASS_SOURCE_TONE_RULE}
	${GRASS_FINE_TEXTURE_SAFETY_RULE}
	${modelRule}
	场景、姿势、构图、光线和内容氛围可以变化，但不能改变图1服装。
	可以添加少量符合图1风格的自然配饰，不能遮挡服装卖点。
	画面要像真实社媒穿搭照片：自然光、真实相机/手机质感、动作松弛、肤色自然、白平衡准确。

	输出质量：photorealistic social-media outfit photo, reference-matched filter mood and exposure contrast, true-to-source garment rendering, natural skin texture, natural camera texture.
	避免：换掉图1服装、改色改款、过度重调人物/服装导致固有色失真、重绘服装材质、丢失图案/logo/文字${referenceNegative}，不要海报排版、多余人物、肢体或手指错误、网红假脸、过度美颜、雪白皮肤、过曝、额外锐化、摩尔纹、波纹、水波纹、频闪条纹、振荡线、假纤维、水印、AI 渲染感。`;
}

export type GrassPayloadBase = {
  garmentUrl: string;
  referenceUrl?: string | null;
  sceneMode?: GrassSceneMode;
  sceneBackgroundMode?: GrassSceneBackgroundMode;
  templateId: GrassTemplateId;
  changeModel: boolean;
  userPrompt: string;
  aiModel: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  prompt: string;
  genCount: number;
};
