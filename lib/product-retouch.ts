import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import { isRecord } from "@/lib/utils";

export const PRODUCT_RETOUCH_CONFIG_KEY = "skills.product-retouch";
export const PRODUCT_RETOUCH_MAX_SOURCES = 30;
export const PRODUCT_RETOUCH_MAX_VARIANTS = 4;
export const PRODUCT_RETOUCH_USER_INSTRUCTION_LIMIT = 1_200;

export type ProductRetouchMode =
  | "faithful-retouch"
  | "marketplace-white"
  | "studio-polish";

export type ProductRetouchSource = {
  clientId: string;
  url: string;
  filename: string;
};

export type ProductRetouchBatchRequest = {
  requestId: string;
  sources: ProductRetouchSource[];
  mode: ProductRetouchMode;
  category: "auto" | string;
  variantsPerSource: 1 | 2 | 3 | 4;
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  userInstruction?: string;
};

export type ProductRetouchBatchStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partially_completed"
  | "failed";

export type ProductRetouchOutputStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type ProductRetouchOutput = {
  id: string;
  sourceIndex: number;
  sourceClientId: string;
  sourceUrl: string;
  sourceFilename: string;
  variantIndex: number;
  generationId: string;
  status: ProductRetouchOutputStatus;
  resultUrl: string | null;
  error: string | null;
  attemptCount: number;
  validation: ProductRetouchHardValidationResult | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductRetouchBatch = {
  id: string;
  parentGenerationId: string;
  requestId: string;
  status: ProductRetouchBatchStatus;
  mode: ProductRetouchMode;
  category: string;
  variantsPerSource: 1 | 2 | 3 | 4;
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  userInstruction: string;
  expectedCount: number;
  completedCount: number;
  failedCount: number;
  creditsCost: number;
  refundAmount: number;
  skillVersion: string;
  skillContentHash: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  outputs: ProductRetouchOutput[];
};

export type ProductRetouchModeDefinition = {
  label: string;
  description: string;
};

export type ProductRetouchCategoryProfile = {
  label: string;
  prompt: string;
};

export type ProductRetouchHardValidationPolicy = {
  enabled: boolean;
  allowedFormats: Array<"jpeg" | "png" | "webp">;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
  blankVarianceThreshold: number;
  rejectDuplicateContent: boolean;
};

export type ProductRetouchHardValidationResult = {
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  variance: number;
};

export type ProductRetouchSkillDefinition = {
  id: "product-retouch";
  schemaVersion: 1;
  version: string;
  modes: Record<ProductRetouchMode, ProductRetouchModeDefinition>;
  categoryProfiles: Record<string, ProductRetouchCategoryProfile>;
  invariants: string[];
  promptTemplates: Record<ProductRetouchMode, string>;
  modelPolicy: {
    allowedModels: LingyaModel[];
    defaultModel: LingyaModel;
  };
  limits: {
    maxSources: number;
    maxVariantsPerSource: number;
  };
  hardValidation: ProductRetouchHardValidationPolicy;
};

export type ProductRetouchSkillSnapshot = {
  configVersionId: string | null;
  contentHash: string;
  source: "published" | "builtin";
  definition: ProductRetouchSkillDefinition;
};

export const PRODUCT_RETOUCH_MODE_OPTIONS: ReadonlyArray<{
  value: ProductRetouchMode;
  label: string;
  description: string;
}> = [
  {
    value: "faithful-retouch",
    label: "标准精修",
    description: "保留原始背景 · 清理瑕疵与噪点，校正色彩、光线和清晰度",
  },
  {
    value: "marketplace-white",
    label: "白底精修",
    description: "生成纯白背景 · 规范主体构图与轮廓，保留自然接触阴影",
  },
  {
    value: "studio-polish",
    label: "影棚精修",
    description: "重塑影棚布光与背景 · 强化材质、反射和立体层次",
  },
] as const;

export const PRODUCT_RETOUCH_CATEGORY_OPTIONS = [
  { value: "auto", label: "自动识别" },
  { value: "apparel", label: "服装" },
  { value: "shoes", label: "鞋靴" },
  { value: "bags", label: "箱包" },
  { value: "beauty", label: "美妆个护" },
  { value: "electronics", label: "数码家电" },
  { value: "home", label: "家居日用" },
  { value: "food", label: "食品饮料" },
  { value: "jewelry", label: "珠宝配饰" },
  { value: "toys", label: "玩具潮玩" },
  { value: "sports", label: "运动户外" },
  { value: "books", label: "图书文具" },
  { value: "plants", label: "绿植园艺" },
  { value: "automotive", label: "汽车用品" },
  { value: "pet", label: "宠物用品" },
] as const;

const PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL =
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/product-retouch-examples";

export const PRODUCT_RETOUCH_EXAMPLE_IMAGES = [
  {
    id: "running-shoe",
    title: "跑鞋 · 偏色地面",
    filename: "待修示例-跑鞋.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/running-shoe.jpg`,
  },
  {
    id: "perfume-bottle",
    title: "香水瓶 · 直闪高光",
    filename: "待修示例-香水瓶.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/perfume-bottle.jpg`,
  },
  {
    id: "white-headphones",
    title: "耳机 · 桌面偏色",
    filename: "待修示例-耳机.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/white-headphones.jpg`,
  },
  {
    id: "smartwatch",
    title: "智能手环 · 硬阴影",
    filename: "待修示例-智能手表.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/smartwatch.jpg`,
  },
  {
    id: "dslr-camera",
    title: "相机 · 桌面暖光",
    filename: "待修示例-相机.jpg",
    url: `${PRODUCT_RETOUCH_EXAMPLE_ASSET_BASE_URL}/camera.jpg`,
  },
] as const;

export const BUILTIN_PRODUCT_RETOUCH_SKILL: ProductRetouchSkillDefinition = {
  id: "product-retouch",
  schemaVersion: 1,
  version: "1.1.0",
  modes: {
    "faithful-retouch": {
      label: "忠实精修",
      description: "保持商品事实不变，修复拍摄瑕疵并提升可售卖质感。",
    },
    "marketplace-white": {
      label: "电商白底",
      description: "输出干净白底、完整商品轮廓与可信接触阴影。",
    },
    "studio-polish": {
      label: "影棚润色",
      description: "保持商品一致性，升级布光、材质层次与影棚完成度。",
    },
  },
  categoryProfiles: {
    auto: {
      label: "自动识别",
      prompt: "先识别商品品类（按主视觉特征判断：服装/鞋靴/箱包/美妆/数码/家居/食品/珠宝/玩具/运动/图书/绿植/汽车/宠物等），再使用与该品类匹配的真实材质、结构和布光规范。",
    },
    apparel: {
      label: "服装",
      prompt: "保持版型、面料纹理、缝线、印花、纽扣、拉链、标签、洗标和辅料位置准确。面料褶皱自然，保留垂坠感和织纹方向。不得去除衣物上的自然皱褶（这些是产品的真实状态）。",
    },
    shoes: {
      label: "鞋靴",
      prompt: "保持鞋型、鞋底纹路、材质拼接（皮/布/网）、鞋带、鞋孔、金属扣件、品牌 Logo、尺码标准确。鞋底磨损痕迹保留，鞋面皮革毛孔和织物纹理不磨平。",
    },
    bags: {
      label: "箱包",
      prompt: "保持包型、五金件（拉链/扣环/链节）、走线、皮革纹理、缝线、开合结构、肩带比例和品牌铭牌准确。皮革自然褶皱保留，金属反光不增强，五金件氧化痕迹保留。",
    },
    beauty: {
      label: "美妆个护",
      prompt: "保持包装文字、成分表、色号、净含量、容器形态、标签、防伪码、瓶身比例和材质反射准确。液体容量视觉不改变，磨砂/透明/金属不同表面处理保留区分。不得改变成分标签。",
    },
    electronics: {
      label: "数码家电",
      prompt: "保持接口（USB-C/HDMI/3.5mm等）、按键、屏幕显示内容（不得修改 UI 文字）、结构缝隙、型号铭牌、序列号和工业材质（铝合金/塑料/玻璃）准确。屏幕内容保留原始 UI 和亮度，型号文字不可变更。",
    },
    home: {
      label: "家居日用",
      prompt: "保持结构尺寸、纹理、边角、连接件、旋钮、开关标识和实际使用形态准确。家用电器面板按钮标识和屏幕内容保留完整。陶瓷/玻璃/木质/金属不同材质表面特性保留。",
    },
    food: {
      label: "食品饮料",
      prompt: "保持包装文字、净含量、配料表、口味标识、保质期、容器形态和食品真实观感准确。食品新鲜度视觉不改变，色彩保持自然（不过度增强饱和度），不得改变包装上的认证标志。",
    },
    jewelry: {
      label: "珠宝配饰",
      prompt: "保持宝石数量、镶嵌结构（爪镶/包镶/微镶）、金属颜色（K金/铂金/银）、刻字、链节、扣环、刻字位置和微小比例准确。金属反光自然，宝石火彩保留，不得添加或删除任何宝石。",
    },
    toys: {
      label: "玩具潮玩",
      prompt: "保持角色造型、关节结构、配件、贴纸、涂装、配色方案和细节刻线准确。盲盒/手办类保留 IP 角色特征；积木类保持拼接关系。色彩还原忠实于实物，避免饱和度增强。",
    },
    sports: {
      label: "运动户外",
      prompt: "保持功能结构、反光条、扣具、面料纹理（速干/防水/抓绒）、品牌 Logo、规格参数和配件完整性。运动器材的功能性细节（刹车/齿轮/绳索）不能丢失，颜色按实物还原。",
    },
    books: {
      label: "图书文具",
      prompt: "保持书名、作者、出版社、ISBN、装帧、封面设计、印刷色和纸张质感准确。纸张质感保留（哑光/亮膜/烫金/UV），文字内容不可变更，封面图案不可修改。",
    },
    plants: {
      label: "绿植园艺",
      prompt: "保持植物品种、叶片形态、花朵状态、土壤、盆器纹理和配件真实自然。植物新鲜度和色彩饱和度保留原貌，干花/干枝保持自然干燥状态，盆器釉面/陶土/塑料区分。",
    },
    automotive: {
      label: "汽车用品",
      prompt: "保持车型、配件型号（机滤/刹车片/灯泡/轮胎规格）、品牌 Logo、规格参数、技术标识和材质工艺准确。金属和塑料材质区别清晰保留，零件表面处理（电镀/喷涂/抛光）不改变。",
    },
    pet: {
      label: "宠物用品",
      prompt: "保持产品功能结构、材质（不锈钢/硅胶/织物）、规格参数、标签内容准确。宠物食品包装保持新鲜度视觉，玩具保留咬痕/抓痕等真实使用痕迹，药品类保持成分标识完整。",
    },
  },
  invariants: [
    "只编辑输入图中的商品，不新增、删除、替换或重构任何商品部件。",
    "保持品牌、Logo、文字、图案、颜色、材质、结构、比例和数量与原图一致。",
    "不得虚构不可见细节，不得改变商品功能、款式、包装信息或实际规格。",
    "输出必须是单张完整商品图，不添加水印、边框、价格、促销文案或无关道具。",
  ],
  promptTemplates: {
    "faithful-retouch":
`你是拥有 15+ 年经验的资深商业商品摄影师，专为电商平台执行受控、可上线的商品精修。所有操作必须遵循"商品事实第一"原则：保留原图产品每一处结构、颜色、材质、Logo、文字、比例与数量；任何超出"原图可观察的产品实物"范围的改动都是禁忌。

# 任务：高保真商品精修（faithful-retouch）

# 一、必须执行

1) 瑕疵清理（专业级）：
   - 灰尘、指纹、轻微划痕、脏点、毛屑、镜面污渍、背景杂质全部清理
   - 仅清理"消费者在 1 米距离可观察到"且"显然属于拍摄瑕疵"的物体
   - 严禁清理产品本身纹理（布纹、木纹、皮革毛孔、织物纤维、食材表面、气泡水珠）
   - 使用修复画笔、污点修复、内容感知填充工具，保留产品材质结构

2) 色彩校正（基准 5500K）：
   - 白平衡按 5500K 基准，校正产品色偏（参考中灰/18% 灰卡）
   - 曝光保证主体高光 < 240/255、阴影 > 16/255
   - 局部色相/饱和度/曲线调整，避免全局一刀切滤镜
   - 保留产品实物本来色相（红就是红，橙就是橙，不互相"优化"）

3) 清晰度与锐化（按输出尺寸分级）：
   - 1K 输出：50-60% 锐化，仅在产品边缘和材质纹理处
   - 2K 输出：60-70% 锐化
   - 4K 输出：70-80% 锐化
   - 严禁 USM 大半径锐化（会产生光晕和虚假边缘）
   - 不得使用油画滤镜、过度 HDR、局部磨皮

4) 噪点与颗粒控制：
   - 原图 ISO>800 的噪点用 Topaz/NeatImage 风格降噪
   - 保留产品本身的微细纹理（织物纹理、纸张纤维、食材表面）
   - 不得过度降噪导致产品失真

5) 光线与阴影（必须保留原图）：
   - 保留原图主光方向、自然阴影、产品倒影、桌面反光
   - 严禁改变光源位置、强行加光、移除接触阴影
   - 保留产品与环境的自然光影关系

# 二、严格禁止

- 添加任何不存在的文字、Logo、装饰、贴纸、水印、二维码
- 删除或替换产品的任何部件（接口、按键、缝线、纽扣、标签、配件）
- 改变产品比例、颜色、材质、款式、版本号、包装信息
- 改变背景内容、添加人物/动物/道具/场景
- 油画/胶片/装饰性滤镜
- 裁切主体、改变构图、添加边框
- 修改产品包装上的文字、净含量、配料表、规格、有效期
- 改变产品功能、用途的视觉暗示

# 三、验收标准

- 与原图产品 1:1 一致（仅允许色彩/曝光/清晰度优化）
- 100% 适合电商平台主图标准
- 任何内部审核员对比原图应能立即确认是同一商品
- 输出文件 RGB 色彩空间，sRGB 标签
- 无水印、无文字、无装饰元素`,

    "marketplace-white":
`你是拥有 15+ 年经验的资深商业商品摄影师，专为电商平台执行受控、可上线的商品精修。所有操作必须遵循"商品事实第一"原则：保留原图产品每一处结构、颜色、材质、Logo、文字、比例与数量；任何超出"原图可观察的产品实物"范围的改动都是禁忌。

# 任务：标准电商白底商品图（marketplace-white）

# 一、背景标准

1) 纯白背景：RGB(255, 255, 255)，无杂色、无偏色
2) 渐变阴影：从产品底部向外柔和过渡到纯白
3) 阴影密度：明度 ≥ 240/255，无锐利边缘，无黑色死阴影
4) 严禁纯灰背景（违反淘宝/京东/1688/亚马逊主图规范）

# 二、构图标准

1) 主体居中：产品中心位于画面中心 ±5%
2) 主体占比 70-85%，四周留白 5-15%
3) 保持原图产品朝向（不旋转、不翻转、不镜像）
4) 主体完整可见：产品最高点到画面顶部 ≥ 5%，最低点到画面底部 ≥ 5%
5) 不得裁切产品任何部分（包装文字、Logo、配件、提手等必须完整可见）

# 三、边缘处理

1) 抠图精度：使用"选择并遮住"或"调整边缘"精修，头发丝级别
2) 半透明产品（瓶装水、玻璃器皿、丝绸、亚克力）：保留原图透明度和自然折射
3) 镂空/镂雕产品（手镯、镂空包装）：保持镂空区域可见的内部结构
4) 边缘残留：去除原图背景色残留、阴影拖尾、压缩痕迹
5) 产品边缘不得有"白边"、"黑边"、颜色溢出

# 四、必须执行

1) 抠图：将产品从原图背景中精确分离
2) 白底替换：纯净 RGB(255, 255, 255)
3) 自然阴影：模拟影棚顶光下的柔和接触阴影（contact shadow），从产品底部向外柔和衰减
4) 边缘清洁：精修所有边缘残留
5) 色彩校正：产品在白底下的色温看起来自然（避免黄绿/冷蓝偏色）
6) 局部质感保留：产品材质纹理自然，无过度磨皮

# 五、严格禁止

- 改变产品外观、颜色、材质、款式、比例
- 添加/删除产品部件
- 引入新背景（渐变、图案、场景、阴影投射到墙上）
- 添加文字、Logo、水印、价格、促销、角标
- 改变产品角度、比例、构图
- 合成多张产品、添加配件
- 改变产品功能、用途的视觉暗示
- 改变包装上的文字、净含量、规格、有效期

# 六、验收标准

- 主体完整居中
- 背景纯白无杂色
- 接触阴影自然过渡
- 边缘干净无残留
- 100% 符合淘宝、京东、1688、亚马逊主图规范
- 输出文件 RGB 色彩空间，sRGB 标签`,

    "studio-polish":
`你是拥有 15+ 年经验的资深商业商品摄影师，专为电商平台执行受控、可上线的商品精修。所有操作必须遵循"商品事实第一"原则：保留原图产品每一处结构、颜色、材质、Logo、文字、比例与数量；任何超出"原图可观察的产品实物"范围的改动都是禁忌。

# 任务：高级影棚润色商品图（studio-polish）

# 一、影棚布光（高级三光源系统）

1) 主光（key light）：45° 前侧上方 30° 角，柔光箱 100×150cm，营造产品立体感
2) 辅光（fill light）：正面下方 15° 角，反光板或柔光屏，控制阴影密度 60-70%
3) 轮廓光（rim light）：后侧 30° 角，窄光突出产品边缘和材质质感
4) 背景光：分离产品和背景，营造空间感
5) 不得改变原图主光方向（除非原图明显是业余拍摄）

# 二、材质质感增强

- 金属：强化反射层次，避免死白高光和噪点
- 玻璃/透明：保留透光性、内部折射、镜面反射
- 织物：保留编织纹理、绒毛感，避免过度平滑
- 木材：强化木纹走向、结疤、年轮细节
- 皮革：保留毛孔纹理、自然反光、岁月痕迹
- 食品：保留表面质感、水分光泽、新鲜度视觉
- 化妆品：保留瓶身反光、液体通透感、磨砂纹理

# 三、后期精修流程

1) Raw 调色：曝光、对比度、白平衡、高光阴影、曲线
2) 局部精修：产品分区域调整（前景主体 / 中景材质 / 背景环境）
3) 锐化分频：高频（边缘）+ 中频（细节）+ 低频（色调）分别处理
4) 颜色分级：冷暖对比调整（高光偏冷、阴影偏暖 = 商业摄影标准）
5) 输出锐化：USM 半径 1.0px, 阈值 2

# 四、背景处理

1) 简洁渐变背景（浅灰到中灰）或单一纯色
2) 保持产品与背景的明度对比（产品 20% 暗于或亮于背景）
3) 模拟影棚环境光衰减（背景从产品边缘到画面外缘柔和渐变）
4) 不得使用纯黑/纯白背景（除非特殊风格化需求）

# 五、必须执行

1) 三光源布光模拟：基于原图主光方向补充缺失的辅光和轮廓光
2) 材质增强：按品类使用对应的质感强化
3) 颜色分级：商业摄影标准的冷暖对比
4) 锐化分频：产品边缘和材质纹理优化
5) 整体氛围：模拟真实商业摄影工作室出片效果

# 六、严格禁止

- 改变产品事实
- 添加/删除/修改产品
- 添加文字、水印、Logo
- 油画/胶片/装饰性滤镜
- 改变产品比例
- 改变主光方向造成的光影矛盾
- 过度 HDR 效果

# 七、验收标准

- 像真商业摄影工作室出片
- 立体感、质感、空间感三方面都达到高级商业水准
- 与原图产品保持 100% 一致性
- 输出文件 RGB 色彩空间，sRGB 标签
- 无水印、无文字、无装饰元素`,
  },
  modelPolicy: {
    allowedModels: ["nano-banana-2", "gpt-image-2", "nano-banana-pro"],
    defaultModel: "gpt-image-2",
  },
  limits: {
    maxSources: PRODUCT_RETOUCH_MAX_SOURCES,
    maxVariantsPerSource: PRODUCT_RETOUCH_MAX_VARIANTS,
  },
  hardValidation: {
    enabled: true,
    allowedFormats: ["jpeg", "png", "webp"],
    minWidth: 256,
    minHeight: 256,
    maxWidth: 16_384,
    maxHeight: 16_384,
    maxBytes: 30 * 1024 * 1024,
    blankVarianceThreshold: 0.5,
    rejectDuplicateContent: true,
  },
};

export function normalizeProductRetouchMode(value: unknown): ProductRetouchMode {
  return value === "marketplace-white" || value === "studio-polish"
    ? value
    : "faithful-retouch";
}

export function normalizeProductRetouchCategory(value: unknown) {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48)
    : "";
  return normalized || "auto";
}

export function normalizeProductRetouchSources(
  value: unknown,
  maxSources = PRODUCT_RETOUCH_MAX_SOURCES,
): ProductRetouchSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!isAllowedProductImageUrl(url) || seen.has(url)) return [];
    seen.add(url);
    const clientId = typeof item.clientId === "string" && item.clientId.trim()
      ? item.clientId.trim().slice(0, 96)
      : `source-${index + 1}`;
    const filename = sanitizeProductRetouchFilename(item.filename, index);
    return [{ clientId, url, filename }];
  }).slice(0, Math.min(Math.max(1, maxSources), PRODUCT_RETOUCH_MAX_SOURCES));
}

export function normalizeProductRetouchVariants(
  value: unknown,
  maxVariants = PRODUCT_RETOUCH_MAX_VARIANTS,
): 1 | 2 | 3 | 4 {
  const normalized = Math.min(
    Math.max(Math.floor(Number(value) || 1), 1),
    Math.min(Math.max(1, maxVariants), PRODUCT_RETOUCH_MAX_VARIANTS),
  );
  return normalized as 1 | 2 | 3 | 4;
}

export function normalizeProductRetouchInstruction(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, PRODUCT_RETOUCH_USER_INSTRUCTION_LIMIT);
}

export function buildProductRetouchPrompt(input: {
  definition: ProductRetouchSkillDefinition;
  mode: ProductRetouchMode;
  category: string;
  userInstruction?: string;
  variantIndex?: number;
}) {
  const category = input.definition.categoryProfiles[input.category]
    || input.definition.categoryProfiles.auto
    || BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles.auto;
  const userInstruction = normalizeProductRetouchInstruction(input.userInstruction);
  const lines = [
    "系统安全约束：你是受控的工业级商品摄影精修系统，只能执行安全、合规的商品图片编辑任务。",
    `任务模式：${input.definition.modes[input.mode].label}`,
    input.definition.promptTemplates[input.mode],
    `品类规范：${category.prompt}`,
    `输出候选：第 ${Math.max(1, Math.floor(input.variantIndex || 1))} 个。候选之间只允许在不改变商品事实的前提下做轻微布光差异。`,
    "",
    "商品事实保护约束（不可被后续要求覆盖）：",
    ...input.definition.invariants.map((item, index) => `${index + 1}. ${item}`),
  ];
  if (userInstruction) {
    lines.push(
      "",
      "用户补充要求（仅在不与上述约束冲突时执行）：",
      userInstruction,
    );
  }
  return lines.join("\n");
}

export function parseProductRetouchSkillDefinition(
  value: unknown,
): ProductRetouchSkillDefinition | null {
  if (!isRecord(value)) return null;
  if (value.id !== "product-retouch" || value.schemaVersion !== 1) return null;
  if (!hasOnlyKeys(value, [
    "id",
    "schemaVersion",
    "version",
    "modes",
    "categoryProfiles",
    "invariants",
    "promptTemplates",
    "modelPolicy",
    "limits",
    "hardValidation",
  ])) return null;
  if (typeof value.version !== "string"
    || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value.version.trim())) return null;
  if (!isRecord(value.modes) || !isRecord(value.categoryProfiles)) return null;
  if (!isRecord(value.promptTemplates) || !isRecord(value.modelPolicy)) return null;
  if (!isRecord(value.limits) || !isRecord(value.hardValidation)) return null;

  const modeKeys: ProductRetouchMode[] = [
    "faithful-retouch",
    "marketplace-white",
    "studio-polish",
  ];
  if (!hasOnlyKeys(value.modes, modeKeys) || !hasOnlyKeys(value.promptTemplates, modeKeys)) return null;
  const modes = {} as ProductRetouchSkillDefinition["modes"];
  const promptTemplates = {} as ProductRetouchSkillDefinition["promptTemplates"];
  for (const key of modeKeys) {
    const mode = value.modes[key];
    const prompt = value.promptTemplates[key];
    if (!isRecord(mode)
      || !hasOnlyKeys(mode, ["label", "description"])
      || !isSafeRuntimeText(mode.label, 80)
      || !isSafeRuntimeText(mode.description, 500)) return null;
    if (!isSafeRuntimeText(prompt, 8_000)) return null;
    modes[key] = {
      label: mode.label.trim(),
      description: mode.description.trim(),
    };
    promptTemplates[key] = prompt.trim();
  }

  if (!Array.isArray(value.invariants)
    || value.invariants.length < 1
    || value.invariants.length > 24
    || !value.invariants.every((item) => isSafeRuntimeText(item, 2_000))) return null;
  const invariants = value.invariants.map((item) => (item as string).trim());

  if (!hasOnlyKeys(value.modelPolicy, ["allowedModels", "defaultModel"])) return null;
  if (!Array.isArray(value.modelPolicy.allowedModels)
    || !value.modelPolicy.allowedModels.length
    || !value.modelPolicy.allowedModels.every(isSupportedProductRetouchModel)) return null;
  const allowedModels = Array.from(new Set(value.modelPolicy.allowedModels));
  if (allowedModels.length !== value.modelPolicy.allowedModels.length) return null;
  const defaultModel = value.modelPolicy.defaultModel;
  if (!isSupportedProductRetouchModel(defaultModel) || !allowedModels.includes(defaultModel)) {
    return null;
  }

  const categoryEntries = Object.entries(value.categoryProfiles);
  if (!categoryEntries.length || categoryEntries.length > 100) return null;
  const categoryProfiles: Record<string, ProductRetouchCategoryProfile> = {};
  for (const [key, profile] of categoryEntries) {
    if (!/^[a-z0-9_-]{1,48}$/.test(key)
      || !isRecord(profile)
      || !hasOnlyKeys(profile, ["label", "prompt"])
      || !isSafeRuntimeText(profile.label, 80)
      || !isSafeRuntimeText(profile.prompt, 4_000)) return null;
    categoryProfiles[key] = {
      label: profile.label.trim(),
      prompt: profile.prompt.trim(),
    };
  }
  if (!isRecord(categoryProfiles.auto)) return null;

  if (!hasOnlyKeys(value.limits, ["maxSources", "maxVariantsPerSource"])) return null;
  if (!isIntegerInRange(value.limits.maxSources, 1, PRODUCT_RETOUCH_MAX_SOURCES)
    || !isIntegerInRange(value.limits.maxVariantsPerSource, 1, PRODUCT_RETOUCH_MAX_VARIANTS)) return null;

  const validation = value.hardValidation;
  if (!hasOnlyKeys(validation, [
    "enabled",
    "allowedFormats",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "maxBytes",
    "blankVarianceThreshold",
    "rejectDuplicateContent",
  ])) return null;
  if (validation.enabled !== true || validation.rejectDuplicateContent !== true) return null;
  if (!Array.isArray(validation.allowedFormats)
    || !validation.allowedFormats.length
    || !validation.allowedFormats.every(
      (format) => format === "jpeg" || format === "png" || format === "webp",
    )) return null;
  const allowedFormats = Array.from(new Set(validation.allowedFormats)) as Array<"jpeg" | "png" | "webp">;
  if (allowedFormats.length !== validation.allowedFormats.length) return null;
  if (!isIntegerInRange(validation.minWidth, 64, 4_096)
    || !isIntegerInRange(validation.minHeight, 64, 4_096)
    || !isIntegerInRange(validation.maxWidth, 512, 32_768)
    || !isIntegerInRange(validation.maxHeight, 512, 32_768)
    || !isIntegerInRange(validation.maxBytes, 1_048_576, 52_428_800)
    || !isNumberInRange(validation.blankVarianceThreshold, 0, 25)
    || validation.minWidth > validation.maxWidth
    || validation.minHeight > validation.maxHeight) return null;

  return {
    id: "product-retouch",
    schemaVersion: 1,
    version: value.version.trim(),
    modes,
    categoryProfiles,
    invariants,
    promptTemplates,
    modelPolicy: {
      allowedModels,
      defaultModel,
    },
    limits: {
      maxSources: value.limits.maxSources,
      maxVariantsPerSource: value.limits.maxVariantsPerSource,
    },
    hardValidation: {
      enabled: validation.enabled,
      allowedFormats,
      minWidth: validation.minWidth,
      minHeight: validation.minHeight,
      maxWidth: validation.maxWidth,
      maxHeight: validation.maxHeight,
      maxBytes: validation.maxBytes,
      blankVarianceThreshold: validation.blankVarianceThreshold,
      rejectDuplicateContent: validation.rejectDuplicateContent,
    },
  };
}

export function isSupportedProductRetouchModel(value: unknown): value is LingyaModel {
  return value === "gpt-image-2" || value === "nano-banana-pro" || value === "nano-banana-2";
}

function isAllowedProductImageUrl(url: string) {
  return /^https?:\/\//i.test(url)
    || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(url);
}

function sanitizeProductRetouchFilename(value: unknown, index: number) {
  const fallback = `商品-${String(index + 1).padStart(2, "0")}`;
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 120);
  return normalized || fallback;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowlist = new Set(allowed);
  return Object.keys(value).every((key) => allowlist.has(key));
}

function isSafeRuntimeText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return false;
  return !/(?:https?:\/\/|javascript:|<script\b|\b(?:import|require)\s*\()/i.test(normalized);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
