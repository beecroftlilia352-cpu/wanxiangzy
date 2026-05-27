export type StylePreset<T extends string> = {
  value: T;
  label: string;
  desc: string;
  swatches: string[];
  imageUrl?: string;
  prompt: string;
  camera?: string;
  poseLines?: string[];
};

const STYLE_REFERENCE_IMAGES = {
  sourceContinuity: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/GbL0WCK/style-source-continuity-05c3091b90.jpg",
  ecommerceClean: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/C3ZPd46t/style-ecommerce-clean-4fd109c9ee.jpg",
  luxuryLookbook: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/XZZ0SQYC/style-luxury-lookbook-40ee5c4f21.jpg",
  fashionEditorial: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/ZzKwr4pX/style-fashion-editorial-668c7be256.jpg",
  koreanClean: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/PzrfrZQb/style-korean-clean-dd34b73f7c.jpg",
  xiaohongshuLifestyle: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/JjS8X6kT/style-xiaohongshu-lifestyle-9840885ee1.jpg",
  euroCampaign: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/VcZjM01K/style-euro-campaign-0a8c39d780.webp",
} as const;

export type PoseSeriesStyle =
  | "source_continuity"
  | "luxury_white_studio"
  | "ecommerce_clean"
  | "luxury_lookbook"
  | "fashion_editorial"
  | "korean_clean"
  | "xiaohongshu_lifestyle"
  | "euro_campaign"
  | "user_custom";

export type ModelShootStyle =
  | "fusion_natural"
  | "luxury_white_studio"
  | "ecommerce_clean"
  | "luxury_lookbook"
  | "fashion_editorial"
  | "korean_clean"
  | "xiaohongshu_lifestyle"
  | "euro_campaign";

export type Garment3dDisplayStyle =
  | "clean_white"
  | "soft_gray"
  | "luxury_shadow"
  | "material_volume"
  | "invisible_body"
  | "catalog_packshot";

export const DEFAULT_POSE_SERIES_STYLE: PoseSeriesStyle = "source_continuity";
export const DEFAULT_MODEL_SHOOT_STYLE: ModelShootStyle = "fusion_natural";
export const DEFAULT_GARMENT_3D_DISPLAY_STYLE: Garment3dDisplayStyle = "clean_white";

const POSE_STYLE_MARKER = "姿势裂变拍摄风格档位";
const MODEL_STYLE_MARKER = "专属模特拍摄风格档位";
const GARMENT_3D_STYLE_MARKER = "服装3D展示风格档位";

const POSE_SEPARATE_STYLE_PROMPTS: Record<PoseSeriesStyle, string> = {
  source_continuity: [
    "Style preset:",
    "Source continuity.",
    "",
    "Keep the original background, lighting direction, color tone and overall photography mood as much as possible.",
    "The result should look like a new shot from the same photoshoot.",
    "Prioritize realism, consistency and outfit readability.",
    "Do not create a new studio setup, new scene or overly stylized atmosphere.",
  ].join("\n"),
  luxury_white_studio: [
    "Style preset:",
    "Clean ecommerce white studio.",
    "",
    "Use a bright white or light neutral studio background.",
    "Use soft commercial lighting, clean shadows, accurate clothing color and low-distraction composition.",
    "Prioritize product clarity, outfit readability and clean ecommerce presentation.",
    "Avoid dramatic editorial lighting, complex props, heavy shadows or lifestyle background.",
  ].join("\n"),
  ecommerce_clean: [
    "Style preset:",
    "Clean ecommerce white studio.",
    "",
    "Use a bright white or light neutral studio background.",
    "Use soft commercial lighting, clean shadows, accurate clothing color and low-distraction composition.",
    "Prioritize product clarity, outfit readability and clean ecommerce presentation.",
    "Avoid dramatic editorial lighting, complex props, heavy shadows or lifestyle background.",
  ].join("\n"),
  luxury_lookbook: [
    "Style preset:",
    "Premium fashion lookbook.",
    "",
    "Use soft refined lighting, elegant neutral background, natural skin tone and tasteful fashion composition.",
    "Create a quiet luxury brand feeling while keeping the outfit clearly readable.",
    "The image should feel polished, calm, premium and commercially usable.",
    "Avoid excessive glamour, heavy retouching, dramatic posing or over-stylized fashion effects.",
  ].join("\n"),
  fashion_editorial: [
    "Style preset:",
    "Fashion editorial.",
    "",
    "Use stronger styling attitude, refined composition and premium magazine-like visual language.",
    "The pose and camera can feel more expressive, but the outfit must remain commercially readable.",
    "Keep the result elegant, high-end and fashion-forward.",
    "Avoid extreme crop, unreadable clothing, excessive cinematic lighting, strange body angles or over-stylized poses.",
  ].join("\n"),
  korean_clean: [
    "Style preset:",
    "Korean clean fashion photography.",
    "",
    "Use fresh, soft and natural lighting with a clean airy color tone.",
    "Keep skin texture natural, bright and realistic, not over-whitened.",
    "The mood should feel gentle, clean, relaxed and polished.",
    "Avoid snow-white skin, plastic face, overexposure, overly cute expression or heavy beauty filter.",
  ].join("\n"),
  xiaohongshu_lifestyle: [
    "Style preset:",
    "Premium fashion lookbook.",
    "",
    "Use soft refined lighting, elegant neutral background, natural skin tone and tasteful fashion composition.",
    "Create a quiet luxury brand feeling while keeping the outfit clearly readable.",
    "The image should feel polished, calm, premium and commercially usable.",
    "Avoid excessive glamour, heavy retouching, dramatic posing or over-stylized fashion effects.",
  ].join("\n"),
  euro_campaign: [
    "Style preset:",
    "Fashion editorial.",
    "",
    "Use stronger styling attitude, refined composition and premium magazine-like visual language.",
    "The pose and camera can feel more expressive, but the outfit must remain commercially readable.",
    "Keep the result elegant, high-end and fashion-forward.",
    "Avoid extreme crop, unreadable clothing, excessive cinematic lighting, strange body angles or over-stylized poses.",
  ].join("\n"),
  user_custom: [
    "Style preset:",
    "Custom user style.",
    "",
    "Follow the user's custom style direction:",
    "{{USER_STYLE}}",
    "",
    "Still keep the same person, same outfit, realistic body proportions, commercially readable clothing and clean fashion photography quality.",
    "Avoid outfit change, face change, unreadable clothing, distorted limbs, excessive retouching or over-stylized results that break product readability.",
  ].join("\n"),
};

export const POSE_SERIES_STYLES: StylePreset<PoseSeriesStyle>[] = [
  {
    value: "source_continuity",
    label: "原图延展",
    desc: "最稳，沿用原图氛围扩展姿势",
    swatches: ["#f8fafc", "#dbeafe", "#a78bfa"],
    imageUrl: STYLE_REFERENCE_IMAGES.sourceContinuity,
    prompt:
      "沿用图1原始场景氛围、背景色调、光线方向和商业摄影质感，主要做姿势与轻微自然表情变化，镜头和构图由 AI 按原图气质自然发挥。",
  },
  {
    value: "luxury_white_studio",
    label: "奢牌白底",
    desc: "白场棚拍，商品细节锐利",
    swatches: ["#ffffff", "#edf2f7", "#94a3b8"],
    imageUrl: STYLE_REFERENCE_IMAGES.ecommerceClean,
    prompt:
      "呈现奢牌电商白底棚拍质感：纯净白色或极浅灰无缝背景，柔和但方向明确的棚拍光，人物脚下、裤脚、包袋和身体接触处有细腻自然阴影；模特姿态克制高级，重心自然，适合生成正面、半身细节、侧面、背面或侧后身自然转向等商品展示角度；头部方向与肩膀、躯干和身体转向保持一致，不要单独回头看镜头；服装图案、logo、纹理、剪裁和配饰只能来自图1本身，不要凭空新增任何品牌标识或无关花纹；商品边缘锐利，皮肤真实，画面留白充足，整体像高端官网商品图而不是普通白底证件照。",
  },
  {
    value: "ecommerce_clean",
    label: "电商白底",
    desc: "适合商品主图，干净、统一、少干扰",
    swatches: ["#ffffff", "#f1f5f9", "#c7d2fe"],
    imageUrl: STYLE_REFERENCE_IMAGES.ecommerceClean,
    prompt:
      "使用干净电商棚拍质感，背景统一、简洁、明亮，服装边缘清晰，人物姿势服务于商品展示；如果图1不是白底，不要粗暴换景，优先保持原图空间关系并净化干扰元素。",
  },
  {
    value: "luxury_lookbook",
    label: "轻奢 Lookbook",
    desc: "柔和高级，适合品牌款式册",
    swatches: ["#f8fafc", "#e5e7eb", "#c4b5fd"],
    imageUrl: STYLE_REFERENCE_IMAGES.luxuryLookbook,
    prompt:
      "呈现轻奢 lookbook 拍摄质感，光线柔和、有层次，姿势克制优雅，画面留白高级，服装廓形和面料垂坠是视觉重点。",
  },
  {
    value: "fashion_editorial",
    label: "时尚杂志",
    desc: "更有大片张力，但不牺牲服装一致性",
    swatches: ["#111827", "#f9fafb", "#ef4444"],
    imageUrl: STYLE_REFERENCE_IMAGES.fashionEditorial,
    prompt:
      "呈现高端时尚杂志 editorial 质感，动作更有镜头表现力但仍自然可信，镜头和构图可以更有变化，同时保持人物身份、服装结构和身体比例稳定。",
  },
  {
    value: "korean_clean",
    label: "韩系清透",
    desc: "清爽柔光，肤色真实不雪白",
    swatches: ["#fef3c7", "#dbeafe", "#fce7f3"],
    imageUrl: STYLE_REFERENCE_IMAGES.koreanClean,
    prompt:
      "使用韩系清透商业摄影风格，柔和自然光、干净色彩、轻盈空气感；保留图1真实肤色和脸型，不要磨成冷白皮或过曝粉白滤镜。",
  },
  {
    value: "xiaohongshu_lifestyle",
    label: "小红书生活感",
    desc: "自然轻松，像真实种草照片组",
    swatches: ["#fef9c3", "#fed7aa", "#bae6fd"],
    imageUrl: STYLE_REFERENCE_IMAGES.xiaohongshuLifestyle,
    prompt:
      "呈现自然生活方式种草感，动作轻松、有呼吸感，表情自然不过度摆拍，画面保持真实摄影质感和服装可购买的展示清晰度。",
  },
  {
    value: "euro_campaign",
    label: "欧美 Campaign",
    desc: "更强气场，适合品牌广告延展",
    swatches: ["#111827", "#d1d5db", "#f97316"],
    imageUrl: STYLE_REFERENCE_IMAGES.euroCampaign,
    prompt:
      "呈现欧美 fashion campaign 的自信气场，姿势更挺拔有力量，光影对比更明确，但人物身份、服装、构图和色彩管理必须统一。",
  },
  {
    value: "user_custom",
    label: "用户自定义",
    desc: "完全自定义四个姿势描述和镜头规则",
    swatches: ["#fef3c7", "#fbbf24", "#f59e0b"],
    prompt:
      "按用户填写的四个姿势和可选镜头/画幅补充执行；未填写的镜头、景别和构图由 AI 自然决定。",
  },
];

export const USER_CUSTOM_POSE_DEFAULT = {
  prompt: "以图1作为同一人物、服装、背景和光线参考；优先让四个姿势明显不同，同时保持服装设计、颜色、图案、面料质感、自然脸部身份、肤色和真实身体比例。",
  camera: "可选镜头/画幅补充：只写风格化方向，不要写死同一相机距离、同一焦段或统一构图；不填写则由 AI 根据姿势和风格自然决定。",
  poses: [
    "姿势1：正面服装展示方向；AI 可自由选择自然手势、重心、视线、表情和镜头语言，服装正面轮廓必须清楚。",
    "姿势2：侧身或三分之二侧身展示方向；AI 可自由选择头发/衣领/袖口/衣摆手势、腿部节奏、视线和镜头语言，侧面轮廓和肩线必须清楚。",
    "姿势3：站定造型方向，不要走路；AI 可自由选择扶腰、胯部、肩线、手部造型、视线和镜头语言，腰线、廓形和面料垂坠必须清楚。",
    "姿势4：轻微迈步或自然转身方向，不要静态扶腰；头部方向与肩膀、躯干和身体转向保持一致，不要单独回头看镜头；AI 可自由选择步态、手臂运动、身体转向、视线和镜头语言，服装运动褶皱和垂坠必须清楚。",
  ],
};

export const MODEL_SHOOT_STYLES: StylePreset<ModelShootStyle>[] = [
  {
    value: "fusion_natural",
    label: "融合原生感",
    desc: "最稳，优先把多张脸融合成真实专属模特",
    swatches: ["#f8fafc", "#e5e7eb", "#a78bfa"],
    imageUrl: STYLE_REFERENCE_IMAGES.sourceContinuity,
    prompt:
      "优先服务人脸融合与真实身份稳定，妆造自然克制，保留参考图的肤色、脸型骨相、五官记忆点、年龄感和面部氛围，生成像真实模特卡的专属人物。",
  },
  {
    value: "luxury_white_studio",
    label: "奢牌白底",
    desc: "高级白场，真实克制",
    swatches: ["#ffffff", "#eef2f7", "#64748b"],
    imageUrl: STYLE_REFERENCE_IMAGES.ecommerceClean,
    prompt:
      "专属模特呈现奢牌白底棚拍质感：干净白色或极浅灰背景，清晰轮廓光、柔和主光和自然接触阴影，表情克制、高级、不网红化；面部保留真实皮肤纹理、骨相和五官辨识度，发丝边缘干净，整体像高端商品官网中的真实模特；不要凭空生成任何品牌 logo、文字水印或与用户服装无关的图案。",
  },
  {
    value: "ecommerce_clean",
    label: "电商模特",
    desc: "干净亲和，适合商品详情和试衣",
    swatches: ["#ffffff", "#e0f2fe", "#c7d2fe"],
    imageUrl: STYLE_REFERENCE_IMAGES.ecommerceClean,
    prompt:
      "专属模特呈现电商模特质感，亲和、干净、可信，妆容自然，皮肤纹理真实，背景白色或浅灰棚拍，重点是可复用的商业头像与试衣模特身份。",
  },
  {
    value: "luxury_lookbook",
    label: "轻奢 Lookbook",
    desc: "高级柔和，适合品牌系列形象",
    swatches: ["#f8fafc", "#d6d3d1", "#c084fc"],
    imageUrl: STYLE_REFERENCE_IMAGES.luxuryLookbook,
    prompt:
      "专属模特呈现轻奢 lookbook 气质，眼神安静自信，妆容精致但不厚重，面部光影柔和有层次，整体像品牌视觉册中的稳定模特身份。",
  },
  {
    value: "fashion_editorial",
    label: "时尚杂志",
    desc: "更强镜头感和专业模特表现力",
    swatches: ["#111827", "#f9fafb", "#dc2626"],
    imageUrl: STYLE_REFERENCE_IMAGES.fashionEditorial,
    prompt:
      "专属模特呈现时尚杂志 editorial portrait，眼神更有表现力，面部结构和妆容更精致，保留参考图真实脸型和肤色，不要做成模板化网红脸。",
  },
  {
    value: "korean_clean",
    label: "韩系清透",
    desc: "清爽柔光，妆感淡雅自然",
    swatches: ["#fef3c7", "#dbeafe", "#fde2e8"],
    imageUrl: STYLE_REFERENCE_IMAGES.koreanClean,
    prompt:
      "专属模特呈现韩系清透妆造，底妆干净但保留真实皮肤纹理，眉眼柔和、唇色自然、光线通透；不要雪白皮、不要冷白过曝、不要统一鹅蛋脸。",
  },
  {
    value: "xiaohongshu_lifestyle",
    label: "小红书生活感",
    desc: "真实自然，适合种草和社媒头像",
    swatches: ["#fef9c3", "#fed7aa", "#bae6fd"],
    imageUrl: STYLE_REFERENCE_IMAGES.xiaohongshuLifestyle,
    prompt:
      "专属模特呈现自然生活方式照片质感，表情轻松亲近，妆容像真实拍摄前的精致日常妆，保留参考图的个人气质和面部氛围。",
  },
  {
    value: "euro_campaign",
    label: "欧美 Campaign",
    desc: "强气场，适合广告主视觉",
    swatches: ["#111827", "#d1d5db", "#f97316"],
    imageUrl: STYLE_REFERENCE_IMAGES.euroCampaign,
    prompt:
      "专属模特呈现欧美 campaign portrait，眼神更坚定、轮廓光更明确、气场更强，但不能改变参考图融合出来的脸型骨相、肤色范围和五官辨识度。",
  },
];

export const GARMENT_3D_DISPLAY_STYLES: StylePreset<Garment3dDisplayStyle>[] = [
  {
    value: "clean_white",
    label: "白底棚拍",
    desc: "最稳，适合电商主图和详情页",
    swatches: ["#ffffff", "#f1f5f9", "#dbeafe"],
    prompt:
      "使用干净白色或极浅灰棚拍背景，主体居中，边缘清楚，柔和自然阴影，像电商商品主图一样准确展示服装结构。",
  },
  {
    value: "soft_gray",
    label: "浅灰质感",
    desc: "保留白底干净感，增加体积层次",
    swatches: ["#f8fafc", "#e5e7eb", "#94a3b8"],
    prompt:
      "使用浅灰棚拍背景和柔和渐层阴影，强调服装厚度、边缘转折、袖身支撑和真实布料体积，不加入场景杂物。",
  },
  {
    value: "luxury_shadow",
    label: "轻奢阴影",
    desc: "更高级的商业棚拍光影",
    swatches: ["#fafaf9", "#d6d3d1", "#a78bfa"],
    prompt:
      "使用轻奢产品摄影光影，柔和主光、细腻轮廓光和克制投影，让服装更有高级感；背景保持简洁，不参考其他款式。",
  },
  {
    value: "material_volume",
    label: "材质强化",
    desc: "重点强化纹理、厚度、褶皱和缝线",
    swatches: ["#f5f5f4", "#bfdbfe", "#86efac"],
    prompt:
      "重点强化图1面料纹理、厚度、缝线、纽扣、拉链、印花、logo、袖口和下摆细节，布料自然撑起，有真实褶皱与垂坠。",
  },
  {
    value: "invisible_body",
    label: "隐形人台",
    desc: "像穿在人台上，但不出现真人身体",
    swatches: ["#ffffff", "#e9d5ff", "#c4b5fd"],
    prompt:
      "生成类似隐形人台或无头无手立体穿着效果，服装自然撑开，肩线、胸腰、袖身或裤型结构合理，但不要出现真人身体、脸、手或皮肤。",
  },
  {
    value: "catalog_packshot",
    label: "目录 Packshot",
    desc: "规整、克制，适合批量商品图",
    swatches: ["#f8fafc", "#e2e8f0", "#64748b"],
    prompt:
      "使用标准商品目录 packshot 风格，角度稳定、构图规整、细节锐利、色彩准确，方便同批商品保持一致视觉规范。",
  },
];

export function normalizePoseSeriesStyle(value: unknown): PoseSeriesStyle {
  return POSE_SERIES_STYLES.some((item) => item.value === value)
    ? (value as PoseSeriesStyle)
    : DEFAULT_POSE_SERIES_STYLE;
}

export function normalizeModelShootStyle(value: unknown): ModelShootStyle {
  return MODEL_SHOOT_STYLES.some((item) => item.value === value)
    ? (value as ModelShootStyle)
    : DEFAULT_MODEL_SHOOT_STYLE;
}

export function normalizeGarment3dDisplayStyle(value: unknown): Garment3dDisplayStyle {
  return GARMENT_3D_DISPLAY_STYLES.some((item) => item.value === value)
    ? (value as Garment3dDisplayStyle)
    : DEFAULT_GARMENT_3D_DISPLAY_STYLE;
}

export function getPoseSeriesStyleLabel(value: unknown) {
  return POSE_SERIES_STYLES.find((item) => item.value === normalizePoseSeriesStyle(value))?.label || "原图延展";
}

export function getModelShootStyleLabel(value: unknown) {
  return MODEL_SHOOT_STYLES.find((item) => item.value === normalizeModelShootStyle(value))?.label || "融合原生感";
}

export function getGarment3dDisplayStyleLabel(value: unknown) {
  return GARMENT_3D_DISPLAY_STYLES.find((item) => item.value === normalizeGarment3dDisplayStyle(value))?.label || "白底棚拍";
}

export function buildPoseSeriesStylePrompt(value: unknown) {
  const style = POSE_SERIES_STYLES.find((item) => item.value === normalizePoseSeriesStyle(value)) || POSE_SERIES_STYLES[0];
  if (style.value === "user_custom") {
    return `${POSE_STYLE_MARKER}：${style.label}。按用户填写的姿势1-4执行，不用默认姿势覆盖。`;
  }
  return `${POSE_STYLE_MARKER}：${style.label}。${style.prompt}`;
}

export function buildPoseSeparateStylePresetPrompt(value: unknown, userStyle = "") {
  const styleId = normalizePoseSeriesStyle(value);
  if (styleId === "source_continuity") return "";
  const preset = POSE_SEPARATE_STYLE_PROMPTS[styleId] || "";
  if (styleId !== "user_custom") return preset;
  const customStyle = userStyle.trim() || "Use the user's custom pose, camera and style notes.";
  return preset.replace("{{USER_STYLE}}", customStyle);
}

export function getPoseSeriesStylePoseLines(value: unknown) {
  return normalizePoseSeriesStyle(value) === "user_custom"
    ? []
    : [];
}

export function buildModelShootStylePrompt(value: unknown) {
  const style = MODEL_SHOOT_STYLES.find((item) => item.value === normalizeModelShootStyle(value)) || MODEL_SHOOT_STYLES[0];
  return `${MODEL_STYLE_MARKER}：${style.label}。${style.prompt}`;
}

export function buildGarment3dDisplayStylePrompt(value: unknown) {
  const style = GARMENT_3D_DISPLAY_STYLES.find((item) => item.value === normalizeGarment3dDisplayStyle(value)) || GARMENT_3D_DISPLAY_STYLES[0];
  return `${GARMENT_3D_STYLE_MARKER}：${style.label}。${style.prompt}`;
}

export function applyPoseSeriesStylePrompt(prompt: string, value: unknown) {
  const preservePoseLines = normalizePoseSeriesStyle(value) === "user_custom";
  return appendPromptSection(prompt, POSE_STYLE_MARKER, buildPoseSeriesStylePrompt(value), { preservePoseLines });
}

export function applyModelShootStylePrompt(prompt: string, value: unknown) {
  return appendPromptSection(prompt, MODEL_STYLE_MARKER, buildModelShootStylePrompt(value));
}

export function applyGarment3dDisplayStylePrompt(prompt: string, value: unknown) {
  return appendPromptSection(prompt, GARMENT_3D_STYLE_MARKER, buildGarment3dDisplayStylePrompt(value));
}

function appendPromptSection(
  prompt: string,
  marker: string,
  section: string,
  options: { preservePoseLines?: boolean } = {}
) {
  const trimmed = prompt.trim();
  if (!trimmed) return section;
  const withoutPrevious = trimmed
    .split("\n")
    .filter((line) => {
      if (line.includes(marker)) return false;
      if (marker === POSE_STYLE_MARKER && !options.preservePoseLines) {
        const cleanLine = line.trim();
        if (/^姿势\s*[1-4][：:]/.test(cleanLine)) return false;
        if (cleanLine.startsWith("镜头统一规则：")) return false;
      }
      return true;
    })
    .join("\n")
    .trim();
  return `${withoutPrevious}\n${section}`.trim();
}
