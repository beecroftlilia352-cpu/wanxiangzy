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
  sourceContinuity: "https://i.ibb.co/GbL0WCK/style-source-continuity.jpg",
  ecommerceClean: "https://i.ibb.co/C3ZPd46t/style-ecommerce-clean.jpg",
  luxuryLookbook: "https://i.ibb.co/XZZ0SQYC/style-luxury-lookbook.jpg",
  fashionEditorial: "https://i.ibb.co/ZzKwr4pX/style-fashion-editorial.jpg",
  koreanClean: "https://i.ibb.co/PzrfrZQb/style-korean-clean.jpg",
  xiaohongshuLifestyle: "https://i.ibb.co/JjS8X6kT/style-xiaohongshu-lifestyle.jpg",
  euroCampaign: "https://i.ibb.co/VcZjM01K/style-euro-campaign.webp",
} as const;

export type PoseSeriesStyle =
  | "source_continuity"
  | "ecommerce_clean"
  | "luxury_lookbook"
  | "fashion_editorial"
  | "korean_clean"
  | "xiaohongshu_lifestyle"
  | "euro_campaign";

export type ModelShootStyle =
  | "fusion_natural"
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

export const POSE_SERIES_STYLES: StylePreset<PoseSeriesStyle>[] = [
  {
    value: "source_continuity",
    label: "原图延展",
    desc: "最稳，同场景同镜头扩展四个姿势",
    swatches: ["#f8fafc", "#dbeafe", "#a78bfa"],
    imageUrl: STYLE_REFERENCE_IMAGES.sourceContinuity,
    prompt:
      "保持图1原始场景、镜头距离、背景色调、光线方向和商业摄影质感，四宫格只做姿势与轻微自然表情变化，像同一套照片的连续 pose sheet。",
    camera:
      "镜头统一规则：consistent medium full-body framing, 50mm natural fashion lens, eye level angle，保持图1原始镜头距离、视平线和画面留白。",
    poseLines: [
      "姿势1：正面自然站立，双手自然下垂或轻触口袋，表情平静自然，完整展示服装正面版型。镜头：consistent medium full-body framing, 50mm natural fashion lens, eye level angle",
      "姿势2：身体轻微侧转30度，肩线放松，一手轻抚头发或整理衣领，柔和浅笑，展示服装侧面轮廓和肩颈线条。镜头：consistent medium full-body framing, 50mm natural fashion lens, eye level angle",
      "姿势3：重心轻微偏移，一手叉腰或扶腰，另一只手自然下垂，自信微笑，展示服装腰线、廓形和面料垂坠。镜头：consistent medium full-body framing, 50mm natural fashion lens, eye level angle",
      "姿势4：轻微迈步或自然转身，专注或轻微回眸，衣服产生真实褶皱、张力和垂坠，不改变服装结构。镜头：consistent medium full-body framing, 50mm natural fashion lens, eye level angle",
    ],
  },
  {
    value: "ecommerce_clean",
    label: "电商白底",
    desc: "适合商品主图，干净、统一、少干扰",
    swatches: ["#ffffff", "#f1f5f9", "#c7d2fe"],
    imageUrl: STYLE_REFERENCE_IMAGES.ecommerceClean,
    prompt:
      "四宫格使用干净电商棚拍质感，背景统一、简洁、明亮，服装边缘清晰，人物姿势服务于商品展示；如果图1不是白底，不要粗暴换景，优先保持原图空间关系并净化干扰元素。",
    camera:
      "镜头统一规则：consistent catalog medium full-body framing, 70mm product photography lens, eye level angle，人物居中、边缘干净、服装展示面积一致。",
    poseLines: [
      "姿势1：正面标准站立，双臂自然放松，表情平静亲和，服装正面版型、肩线、领口和下摆必须完整清楚。镜头：consistent catalog medium full-body framing, 70mm product photography lens, eye level angle",
      "姿势2：身体轻微侧转20-30度，一手自然整理衣摆或衣领，表情柔和，展示侧面厚度、袖身和面料垂坠。镜头：consistent catalog medium full-body framing, 70mm product photography lens, eye level angle",
      "姿势3：一手轻扶腰线或口袋，另一手自然下垂，微笑克制，突出腰线、裤装/裙装廓形和搭配比例。镜头：consistent catalog medium full-body framing, 70mm product photography lens, eye level angle",
      "姿势4：轻微迈步但身体稳定，眼神自然看向镜头，展示走动时的真实褶皱和下摆动态，不遮挡服装重点。镜头：consistent catalog medium full-body framing, 70mm product photography lens, eye level angle",
    ],
  },
  {
    value: "luxury_lookbook",
    label: "轻奢 Lookbook",
    desc: "柔和高级，适合品牌款式册",
    swatches: ["#f8fafc", "#e5e7eb", "#c4b5fd"],
    imageUrl: STYLE_REFERENCE_IMAGES.luxuryLookbook,
    prompt:
      "四宫格呈现轻奢 lookbook 拍摄质感，光线柔和、有层次，姿势克制优雅，画面留白高级，服装廓形和面料垂坠是视觉重点。",
    camera:
      "镜头统一规则：consistent medium full-body framing with refined negative space, 70mm lookbook lens, eye level angle，留白高级但人物比例不漂移。",
    poseLines: [
      "姿势1：自然直立，肩颈放松，一只手轻触衣袖或口袋，表情安静自信，突出整体廓形和高级留白。镜头：consistent medium full-body framing with refined negative space, 70mm lookbook lens, eye level angle",
      "姿势2：身体优雅侧转30度，头部轻微回正，手部轻整理衣领或发丝，柔和浅笑，展示肩颈线和面料层次。镜头：consistent medium full-body framing with refined negative space, 70mm lookbook lens, eye level angle",
      "姿势3：重心偏移，手臂形成干净线条，一手轻扶腰侧，表情从容，突出腰线、下摆和垂坠感。镜头：consistent medium full-body framing with refined negative space, 70mm lookbook lens, eye level angle",
      "姿势4：轻微转身或迈步，衣摆自然摆动，眼神轻微离开镜头，呈现同一组 lookbook 的连续感。镜头：consistent medium full-body framing with refined negative space, 70mm lookbook lens, eye level angle",
    ],
  },
  {
    value: "fashion_editorial",
    label: "时尚杂志",
    desc: "更有大片张力，但不牺牲服装一致性",
    swatches: ["#111827", "#f9fafb", "#ef4444"],
    imageUrl: STYLE_REFERENCE_IMAGES.fashionEditorial,
    prompt:
      "四宫格呈现高端时尚杂志 editorial pose sheet，动作更有镜头表现力但仍自然可信，保持同一焦段、同一构图和同一服装展示范围。",
    camera:
      "镜头统一规则：consistent editorial medium full-body framing, 70mm fashion editorial lens, eye level angle，允许更强身体线条但禁止特写、广角和俯仰拍。",
    poseLines: [
      "姿势1：正面站立但肩线有轻微角度，手臂自然形成时装大片线条，眼神直接、自信，完整展示正面服装结构。镜头：consistent editorial medium full-body framing, 70mm fashion editorial lens, eye level angle",
      "姿势2：身体侧转30度，一手轻触头发或后颈，另一手自然下垂，表情冷静有镜头感，展示肩颈和袖身轮廓。镜头：consistent editorial medium full-body framing, 70mm fashion editorial lens, eye level angle",
      "姿势3：重心明显但自然偏移，一手扶腰，身体形成克制的 S 线，表情自信，突出腰线、廓形和面料张力。镜头：consistent editorial medium full-body framing, 70mm fashion editorial lens, eye level angle",
      "姿势4：轻微迈步或转身回眸，衣服形成真实动态褶皱，眼神专注，像杂志 pose sheet 的最后一格。镜头：consistent editorial medium full-body framing, 70mm fashion editorial lens, eye level angle",
    ],
  },
  {
    value: "korean_clean",
    label: "韩系清透",
    desc: "清爽柔光，肤色真实不雪白",
    swatches: ["#fef3c7", "#dbeafe", "#fce7f3"],
    imageUrl: STYLE_REFERENCE_IMAGES.koreanClean,
    prompt:
      "四宫格使用韩系清透商业摄影风格，柔和自然光、干净色彩、轻盈空气感；保留图1真实肤色和脸型，不要磨成冷白皮或过曝粉白滤镜。",
    camera:
      "镜头统一规则：consistent clean medium full-body framing, 50mm soft natural lens, eye level angle，画面通透但曝光不过白。",
    poseLines: [
      "姿势1：正面轻松站立，双手自然垂落或轻搭衣摆，表情平静柔和，服装正面清楚、肤色自然。镜头：consistent clean medium full-body framing, 50mm soft natural lens, eye level angle",
      "姿势2：身体轻微侧转，手指自然整理发丝或衣领，浅浅微笑，呈现清透自然的肩颈线和面料纹理。镜头：consistent clean medium full-body framing, 50mm soft natural lens, eye level angle",
      "姿势3：重心轻偏，一手轻扶腰线，另一手放松，笑容柔和，展示服装比例和轻盈垂坠。镜头：consistent clean medium full-body framing, 50mm soft natural lens, eye level angle",
      "姿势4：轻微向前迈步或自然回眸，表情专注温柔，衣摆有轻微空气感动态但服装结构不变。镜头：consistent clean medium full-body framing, 50mm soft natural lens, eye level angle",
    ],
  },
  {
    value: "xiaohongshu_lifestyle",
    label: "小红书生活感",
    desc: "自然轻松，像真实种草照片组",
    swatches: ["#fef9c3", "#fed7aa", "#bae6fd"],
    imageUrl: STYLE_REFERENCE_IMAGES.xiaohongshuLifestyle,
    prompt:
      "四宫格呈现自然生活方式种草感，动作轻松、有呼吸感，表情自然不过度摆拍，画面保持真实摄影质感和服装可购买的展示清晰度。",
    camera:
      "镜头统一规则：consistent lifestyle medium full-body framing, 50mm everyday photography lens, eye level angle，像真实种草连拍但构图和服装展示范围统一。",
    poseLines: [
      "姿势1：自然站立，身体放松，双手轻搭包带、口袋或衣摆，表情平静真实，像生活方式照片的第一张。镜头：consistent lifestyle medium full-body framing, 50mm everyday photography lens, eye level angle",
      "姿势2：身体轻侧，手部自然整理头发或衣领，浅笑自然不摆拍，展示服装侧面和日常穿着松弛感。镜头：consistent lifestyle medium full-body framing, 50mm everyday photography lens, eye level angle",
      "姿势3：重心偏移，一手扶腰或轻触衣摆，眼神自然看向镜头，突出穿搭比例、腰线和面料垂坠。镜头：consistent lifestyle medium full-body framing, 50mm everyday photography lens, eye level angle",
      "姿势4：轻微迈步、转身或回头，像被抓拍的自然动态，衣服产生真实褶皱，不改变版型和搭配。镜头：consistent lifestyle medium full-body framing, 50mm everyday photography lens, eye level angle",
    ],
  },
  {
    value: "euro_campaign",
    label: "欧美 Campaign",
    desc: "更强气场，适合品牌广告延展",
    swatches: ["#111827", "#d1d5db", "#f97316"],
    imageUrl: STYLE_REFERENCE_IMAGES.euroCampaign,
    prompt:
      "四宫格呈现欧美 fashion campaign 的自信气场，姿势更挺拔有力量，光影对比更明确，但人物身份、服装、构图和色彩管理必须统一。",
    camera:
      "镜头统一规则：consistent campaign medium full-body framing, 85mm commercial fashion lens, eye level angle，压缩感更高级但人物必须完整、比例稳定。",
    poseLines: [
      "姿势1：正面挺拔站立，肩线打开，双手自然但有力量感，眼神坚定，完整展示服装正面和品牌气场。镜头：consistent campaign medium full-body framing, 85mm commercial fashion lens, eye level angle",
      "姿势2：身体侧转30度，一手轻触腰侧或衣领，另一手自然下垂，表情冷静自信，展示服装侧面结构和轮廓。镜头：consistent campaign medium full-body framing, 85mm commercial fashion lens, eye level angle",
      "姿势3：重心偏移更有张力，一手叉腰或扶腰，身体线条挺拔，突出腰线、肩线和面料力量感。镜头：consistent campaign medium full-body framing, 85mm commercial fashion lens, eye level angle",
      "姿势4：轻微迈步或转身回眸，动作干净有广告大片气场，衣服产生真实动态褶皱且结构不变。镜头：consistent campaign medium full-body framing, 85mm commercial fashion lens, eye level angle",
    ],
  },
];

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
  return [
    `${POSE_STYLE_MARKER}：${style.label}。${style.prompt}`,
    style.camera,
    ...(style.poseLines || []),
  ].filter(Boolean).join("\n");
}

export function getPoseSeriesStylePoseLines(value: unknown) {
  const style = POSE_SERIES_STYLES.find((item) => item.value === normalizePoseSeriesStyle(value)) || POSE_SERIES_STYLES[0];
  return style.poseLines || [];
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
  return appendPromptSection(prompt, POSE_STYLE_MARKER, buildPoseSeriesStylePrompt(value));
}

export function applyModelShootStylePrompt(prompt: string, value: unknown) {
  return appendPromptSection(prompt, MODEL_STYLE_MARKER, buildModelShootStylePrompt(value));
}

export function applyGarment3dDisplayStylePrompt(prompt: string, value: unknown) {
  return appendPromptSection(prompt, GARMENT_3D_STYLE_MARKER, buildGarment3dDisplayStylePrompt(value));
}

function appendPromptSection(prompt: string, marker: string, section: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return section;
  const withoutPrevious = trimmed
    .split("\n")
    .filter((line) => {
      if (line.includes(marker)) return false;
      if (marker === POSE_STYLE_MARKER) {
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
