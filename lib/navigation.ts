import {
  Bot,
  Box,
  Camera,
  Clapperboard,
  GalleryHorizontalEnd,
  Heart,
  History,
  Home,
  Images,
  ImagePlus,
  Languages,
  PackageOpen,
  PackageSearch,
  PersonStanding,
  PlaySquare,
  ScanFace,
  ServerCog,
  Shirt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type AppModuleKey =
  | "home"
  | "aiShoots"
  | "productImages"
  | "assistant"
  | "tools"
  | "aiVideo"
  | "works";

export type FeatureKey =
  | "home"
  | "agent"
  | "tryon"
  | "outfitFusion"
  | "faceSwap"
  | "grass"
  | "productRetouch"
  | "productSet"
  | "allCategoryProductImage"
  | "modelBackground"
  | "materialEnhancement"
  | "pose"
  | "model"
  | "garment3d"
  | "imageTranslation"
  | "videoImageToVideo"
  | "videoMotion"
  | "videoFirstLastFrame"
  | "generalImage"
  | "textToImage"
  | "imageToImage"
  | "apiTest"
  | "history";

export type TopModuleNavItem = {
  key: AppModuleKey;
  href: string;
  /** 中文兜底文案（未接入 i18n 的消费方继续可用） */
  label: string;
  /** i18n 消息键（Header.modules.*），渲染时优先翻译 */
  labelKey?: string;
  icon: LucideIcon;
  badge?: "NEW";
  comingSoon?: boolean;
};

export type FeatureNavItem = {
  key: FeatureKey;
  module: AppModuleKey;
  href: string;
  label: string;
  /** i18n 消息键，接入翻译的消费方使用 */
  labelKey?: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  badge?: "NEW";
  comingSoon?: boolean;
  hiddenFromNav?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

const SHOW_INTERNAL_NAV =
  process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true" || process.env.NODE_ENV !== "production";

export const TOP_MODULES: TopModuleNavItem[] = [
  { key: "home", href: "/", label: "首页", labelKey: "Header.modules.home", icon: Home },
  { key: "aiShoots", href: "/create", label: "模特图", labelKey: "Header.modules.aiShoots", icon: Camera },
  {
    key: "productImages",
    href: "/product-retouch",
    label: "商品图",
    labelKey: "Header.modules.productImages",
    icon: PackageOpen,
    badge: "NEW",
  },
  { key: "assistant", href: "/agent", label: "工作流助手", labelKey: "Header.modules.assistant", icon: Bot },
  { key: "tools", href: "/general-image", label: "素材生成", labelKey: "Header.modules.tools", icon: Images },
  { key: "aiVideo", href: "/video", label: "AI视频", labelKey: "Header.modules.aiVideo", icon: Clapperboard, badge: "NEW" },
  { key: "works", href: "/history", label: "作品库", labelKey: "Header.modules.works", icon: GalleryHorizontalEnd },
];

/**
 * 主导航上展示的"3 个工作场景 + 1 个作品库"。
 * - 3 个场景按使用顺序排列：aiShoots → productImages → aiVideo
 * - 作品库（works）独立成一类，与"做"分离
 * - home 通过 logo 访问；tools（素材生成）只走 URL，不再占主导航位
 */
export const VISIBLE_TOP_MODULES: TopModuleNavItem[] = TOP_MODULES.filter(
  (item) => item.key !== "home" && item.key !== "tools" && item.key !== "assistant",
);

export const FEATURE_ITEMS: FeatureNavItem[] = [
  {
    key: "home",
    module: "home",
    href: "/",
    label: "首页",
    labelKey: "Header.features.home.label",
    description: "工作台入口",
    icon: Home,
  },
  {
    key: "tryon",
    module: "aiShoots",
    href: "/create",
    label: "服装上身",
    labelKey: "Header.features.tryon.label",
    shortLabel: "上身",
    description: "服装上身与模特试穿",
    icon: Shirt,
  },
  {
    key: "outfitFusion",
    module: "aiShoots",
    href: "/outfit-fusion",
    label: "搭配融图",
    labelKey: "Header.features.outfitFusion.label",
    shortLabel: "搭配",
    description: "多张服饰、配件和模特参考融合成套搭配图",
    icon: Sparkles,
  },
  {
    key: "model",
    module: "aiShoots",
    href: "/model",
    label: "专属模特",
    labelKey: "Header.features.model.label",
    shortLabel: "模特",
    description: "生成专属模特素材",
    icon: PersonStanding,
  },
  {
    key: "faceSwap",
    module: "aiShoots",
    href: "/face-swap",
    label: "换脸",
    labelKey: "Header.features.faceSwap.label",
    shortLabel: "换脸",
    description: "替换面部特征并保留主体风格",
    icon: ScanFace,
  },
  {
    key: "grass",
    module: "aiShoots",
    href: "/grass",
    label: "种草图",
    labelKey: "Header.features.grass.label",
    shortLabel: "种草",
    description: "小红书、电商和内容种草图",
    icon: Heart,
  },
  {
    key: "productRetouch",
    module: "productImages",
    href: "/product-retouch",
    label: "商品精修",
    labelKey: "Header.features.productRetouch.label",
    shortLabel: "精修",
    description: "批量完成标准精修、白底精修与影棚精修",
    icon: Sparkles,
  },
  {
    key: "imageTranslation",
    module: "productImages",
    href: "/image-translation",
    label: "图片翻译",
    labelKey: "Header.features.imageTranslation.label",
    shortLabel: "翻译",
    description: "批量翻译商品图文字，保留品牌、Logo、产品和参数原样",
    icon: Languages,
    badge: "NEW",
  },
  {
    key: "productSet",
    module: "productImages",
    href: "/product-set",
    label: "商品套图",
    labelKey: "Header.features.productSet.label",
    shortLabel: "套图",
    description: "生成主图、辅图和详情页商品视觉",
    icon: GalleryHorizontalEnd,
  },
  {
    key: "allCategoryProductImage",
    module: "productImages",
    href: "/all-category-product-image",
    label: "全品类商品图",
    labelKey: "Header.features.allCategoryProductImage.label",
    shortLabel: "全品类",
    description: "上传 SKU 图，生成主图与详情图规划和成图",
    icon: PackageSearch,
    hiddenFromNav: true,
  },
  {
    key: "modelBackground",
    module: "aiShoots",
    href: "/model-background",
    label: "换背景",
    labelKey: "Header.features.modelBackground.label",
    shortLabel: "背景",
    description: "保留主体并替换拍摄场景",
    icon: Images,
  },
  {
    key: "materialEnhancement",
    module: "aiShoots",
    href: "/material-enhancement",
    label: "材质增强",
    labelKey: "Header.features.materialEnhancement.label",
    shortLabel: "材质",
    description: "用高清服装图增强上身图材质细节",
    icon: Sparkles,
  },
  {
    key: "pose",
    module: "aiShoots",
    href: "/pose",
    label: "姿势裂变",
    labelKey: "Header.features.pose.label",
    shortLabel: "姿势",
    description: "生成多姿势、单图或宫格输出",
    icon: PersonStanding,
  },
  {
    key: "garment3d",
    module: "aiShoots",
    href: "/garment-3d",
    label: "服装 3D",
    labelKey: "Header.features.garment3d.label",
    shortLabel: "3D",
    description: "服装立体展示素材",
    icon: Box,
  },
  {
    key: "videoImageToVideo",
    module: "aiVideo",
    href: "/video",
    label: "图生视频",
    labelKey: "Header.features.videoImageToVideo.label",
    shortLabel: "图生视频",
    description: "上传图片并生成模特展示视频",
    icon: Clapperboard,
  },
  {
    key: "videoMotion",
    module: "aiVideo",
    href: "/video/motion-control",
    label: "动作模仿",
    labelKey: "Header.features.videoMotion.label",
    shortLabel: "动作",
    description: "用参考视频驱动模特动作",
    icon: PlaySquare,
    badge: "NEW",
  },
  {
    key: "videoFirstLastFrame",
    module: "aiVideo",
    href: "/video/first-last-frame",
    label: "首尾帧",
    labelKey: "Header.features.videoFirstLastFrame.label",
    shortLabel: "首尾帧",
    description: "指定首帧和尾帧生成过渡视频",
    icon: ImagePlus,
  },
  {
    key: "agent",
    module: "assistant",
    href: "/agent",
    label: "工作流助手",
    labelKey: "Header.features.agent.label",
    shortLabel: "助手",
    description: "聊天、分析与工作流执行",
    icon: Bot,
    hiddenFromNav: true,
  },
  {
    key: "textToImage",
    module: "tools",
    href: "/general-image",
    label: "文生图",
    labelKey: "Header.features.textToImage.label",
    shortLabel: "文生图",
    description: "用文字描述直接生成图片",
    icon: ImagePlus,
  },
  {
    key: "imageToImage",
    module: "tools",
    href: "/general-image/image-to-image",
    label: "图生图",
    labelKey: "Header.features.imageToImage.label",
    shortLabel: "图生图",
    description: "多张参考图结合提示词生成图片",
    icon: Images,
  },
  {
    key: "apiTest",
    module: "tools",
    href: "/api-platform-test",
    label: "API 测试",
    labelKey: "Header.features.apiTest.label",
    shortLabel: "API",
    description: "模型与接口测试页面",
    icon: ServerCog,
  },
  {
    key: "history",
    module: "works",
    href: "/history",
    label: "作品库",
    labelKey: "Header.features.history.label",
    shortLabel: "作品",
    description: "历史作品与参数复用",
    icon: History,
  },
];

function isInternalFeatureItem(item: FeatureNavItem) {
  return item.key === "apiTest";
}

function isHiddenFeatureItem(item: FeatureNavItem) {
  return item.hiddenFromNav === true;
}

export function getFeatureItem(key: FeatureKey) {
  return FEATURE_ITEMS.find((item) => item.key === key);
}

export function getActiveTopModule(pathname: string | null | undefined): AppModuleKey {
  const path = pathname || "/";
  const feature = FEATURE_ITEMS
    .filter((item) => item.href !== "/")
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => path === item.href || path.startsWith(`${item.href}/`));

  if (feature) return feature.module;
  if (path === "/" || path.startsWith("/login") || path.startsWith("/auth")) return "home";
  return "aiShoots";
}

export function getFeatureItemsForModule(module: AppModuleKey) {
  const items =
    module === "home"
      ? FEATURE_ITEMS.filter((item) => item.module === "aiShoots")
      : FEATURE_ITEMS.filter((item) => item.module === module);

  const visibleItems = items.filter((item) => !isHiddenFeatureItem(item));
  return SHOW_INTERNAL_NAV ? visibleItems : visibleItems.filter((item) => !isInternalFeatureItem(item));
}
