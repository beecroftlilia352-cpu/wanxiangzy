export type TryOnSceneMode = "system_reference" | "upload_reference" | "auto_design" | "favorites";
export type AutoDesignPlatform =
  | "ecommerce_clean"
  | "luxury_lookbook"
  | "fashion_editorial"
  | "korean_clean"
  | "xiaohongshu_lifestyle"
  | "euro_campaign"
  | "pose_variation";
export type AutoDesignFraming = "auto" | "upper_body" | "lower_body" | "full_body";
export type AutoDesignBackground = "non_white" | "white";

export interface AutoDesignSettings {
  platform: AutoDesignPlatform;
  framing: AutoDesignFraming;
  background: AutoDesignBackground;
}

export const DEFAULT_AUTO_DESIGN: AutoDesignSettings = {
  platform: "ecommerce_clean",
  framing: "auto",
  background: "non_white",
};

export const SCENE_MODE_LABELS: Record<TryOnSceneMode, string> = {
  system_reference: "系统预设",
  upload_reference: "上传",
  auto_design: "智能模式",
  favorites: "收藏",
};

export const AUTO_DESIGN_PLATFORMS: Array<{ value: AutoDesignPlatform; label: string; desc: string; prompt: string }> = [
  {
    value: "ecommerce_clean",
    label: "电商白底",
    desc: "干净准确，细节优先",
    prompt: "电商白底摄影方案：干净白底或浅灰白棚拍背景，准确白平衡，均匀柔和棚拍灯光，服装颜色和结构清楚，边缘干净，适合商品详情页。不要过曝美白，不要改变服装原色。",
  },
  {
    value: "luxury_lookbook",
    label: "轻奢 Lookbook",
    desc: "高级克制，柔和棚拍",
    prompt: "轻奢 Lookbook 摄影方案：premium minimalist lookbook photography，柔和方向性棚拍光，克制高级的中性色背景，优雅放松姿态，细腻阴影和质感，强调服装廓形与面料垂坠。",
  },
  {
    value: "fashion_editorial",
    label: "时尚杂志",
    desc: "大片张力，杂志质感",
    prompt: "时尚杂志摄影方案：high-end fashion magazine editorial photography，姿态更有张力，电影感灯光，受控高对比，精致造型和高级色彩管理；但必须保持服装真实还原和自然肤色。",
  },
  {
    value: "korean_clean",
    label: "韩系清透",
    desc: "柔和清爽，空气感",
    prompt: "韩系清透摄影方案：柔和自然光感，干净浅色背景，轻盈空气感，妆发清爽，画面明亮但不过曝；保留自然肤色层次，不要奶白滤镜或雪白皮。",
  },
  {
    value: "xiaohongshu_lifestyle",
    label: "小红书生活感",
    desc: "真实亲和，种草氛围",
    prompt: "小红书生活感摄影方案：自然生活方式场景，亲和松弛的动作，真实环境光，轻微社媒氛围和自然色彩，适合内容种草；服装主体必须清晰，不要过度滤镜化。",
  },
  {
    value: "euro_campaign",
    label: "欧美 Campaign",
    desc: "立体强气场，广告感",
    prompt: "欧美 Campaign 摄影方案：品牌广告级视觉，立体轮廓光，更强模特气场，成熟精致的光影层次和构图，强调服装高级感；不要改变脸型、肤色、体态和服装结构。",
  },
  {
    value: "pose_variation",
    label: "姿势裂变",
    desc: "动作延展，服装展示",
    prompt: "姿势裂变摄影方案：自动设计更适合服装展示的自然姿势和动态，强调腰线、肩线、侧面轮廓、面料垂坠和完整穿搭比例；生成单张换装成片，不生成四宫格。",
  },
];

export const AUTO_DESIGN_FRAMINGS: Array<{ value: AutoDesignFraming; label: string; prompt: string }> = [
  {
    value: "auto",
    label: "不限",
    prompt: "根据服装品类自动选择最适合展示服装结构的构图，可以是上半身、下半身或全身。",
  },
  {
    value: "upper_body",
    label: "上半身图",
    prompt: "使用上半身或中近景构图，重点展示领口、肩线、袖型、胸前图案、面料纹理和上装版型。",
  },
  {
    value: "lower_body",
    label: "下半身图",
    prompt: "使用下半身或中远景构图，重点展示腰线、裤装/裙装版型、长度、垂坠、腿部比例和鞋履关系。",
  },
  {
    value: "full_body",
    label: "全身图",
    prompt: "使用完整全身构图，清楚展示整套穿搭比例、服装廓形、下摆、鞋履和整体造型。",
  },
];

export const AUTO_DESIGN_BACKGROUNDS: Array<{ value: AutoDesignBackground; label: string; prompt: string }> = [
  {
    value: "non_white",
    label: "非白底图",
    prompt: "自动设计适合服装风格的真实棚拍或生活方式背景，背景干净高级但不抢服装主体。",
  },
  {
    value: "white",
    label: "白底图",
    prompt: "使用干净白底或浅灰白棚拍背景，曝光准确，边缘清晰，适合电商商品展示。",
  },
];

export function normalizeSceneMode(value: unknown): TryOnSceneMode {
  if (
    value === "system_reference" ||
    value === "upload_reference" ||
    value === "auto_design" ||
    value === "favorites"
  ) {
    return value;
  }
  return "auto_design";
}

export function normalizeAutoDesignSettings(value: unknown): AutoDesignSettings {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const platform = AUTO_DESIGN_PLATFORMS.some((item) => item.value === record.platform)
    ? record.platform as AutoDesignPlatform
    : DEFAULT_AUTO_DESIGN.platform;
  const framing = AUTO_DESIGN_FRAMINGS.some((item) => item.value === record.framing)
    ? record.framing as AutoDesignFraming
    : DEFAULT_AUTO_DESIGN.framing;
  const background = AUTO_DESIGN_BACKGROUNDS.some((item) => item.value === record.background)
    ? record.background as AutoDesignBackground
    : DEFAULT_AUTO_DESIGN.background;

  return { platform, framing, background };
}

export function buildAutoDesignPrompt(settings: AutoDesignSettings) {
  const platform = AUTO_DESIGN_PLATFORMS.find((item) => item.value === settings.platform) || AUTO_DESIGN_PLATFORMS[0];
  const framing = AUTO_DESIGN_FRAMINGS.find((item) => item.value === settings.framing) || AUTO_DESIGN_FRAMINGS[0];
  const background = AUTO_DESIGN_BACKGROUNDS.find((item) => item.value === settings.background) || AUTO_DESIGN_BACKGROUNDS[0];

  return `智能模式拍摄方案：${platform.label}，构图为${framing.label}，背景为${background.label}。当前不使用参考图，由 AI 根据服装类型、版型和商业展示需求，自动设计最适合的模特姿势、构图、背景场景、镜头距离和灯光方案。${platform.prompt}${framing.prompt}${background.prompt}智能模式只能决定拍摄方案，不得改变服装图的版型、颜色、材质、图案和细节，不得默认美白，不得过度瘦身或改变真实体态。`;
}
