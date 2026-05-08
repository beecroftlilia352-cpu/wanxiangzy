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
  PersonStanding,
  ScanFace,
  ServerCog,
  Shirt,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type AppModuleKey = "home" | "aiShoots" | "assistant" | "tools" | "aiVideo" | "works";

export type FeatureKey =
  | "home"
  | "agent"
  | "tryon"
  | "faceSwap"
  | "grass"
  | "productSet"
  | "modelBackground"
  | "pose"
  | "model"
  | "garment3d"
  | "generalImage"
  | "textToImage"
  | "imageToImage"
  | "apiTest"
  | "history";

export type TopModuleNavItem = {
  key: AppModuleKey;
  href: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export type FeatureNavItem = {
  key: FeatureKey;
  module: AppModuleKey;
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

const SHOW_INTERNAL_NAV =
  process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true" || process.env.NODE_ENV !== "production";

export const TOP_MODULES: TopModuleNavItem[] = [
  { key: "aiShoots", href: "/create", label: "AI 拍摄", icon: Camera },
  { key: "assistant", href: "/agent", label: "AI 助手", icon: Bot },
  { key: "tools", href: "/general-image", label: "素材生成", icon: Sparkles },
  { key: "aiVideo", href: "#", label: "AI 视频", icon: Clapperboard, comingSoon: true },
  { key: "works", href: "/history", label: "作品库", icon: GalleryHorizontalEnd },
];

export const FEATURE_ITEMS: FeatureNavItem[] = [
  {
    key: "home",
    module: "home",
    href: "/",
    label: "首页",
    description: "工作台入口",
    icon: Home,
  },
  {
    key: "tryon",
    module: "aiShoots",
    href: "/create",
    label: "AI 换装",
    shortLabel: "换装",
    description: "服装上身与模特试穿",
    icon: Shirt,
  },
  {
    key: "model",
    module: "aiShoots",
    href: "/model",
    label: "模特生成",
    shortLabel: "模特生成",
    description: "生成专属模特素材",
    icon: PersonStanding,
  },
  {
    key: "faceSwap",
    module: "aiShoots",
    href: "/face-swap",
    label: "AI 换脸",
    shortLabel: "AI 换脸",
    description: "只替换面部五官特征",
    icon: ScanFace,
  },
  {
    key: "grass",
    module: "aiShoots",
    href: "/grass",
    label: "种草图",
    shortLabel: "种草图",
    description: "小红书、电商内容种草图",
    icon: Heart,
  },
  {
    key: "productSet",
    module: "aiShoots",
    href: "/product-set",
    label: "商品套图",
    shortLabel: "商品套图",
    description: "一键生成主图、辅图和详情页商品视觉",
    icon: GalleryHorizontalEnd,
  },
  {
    key: "modelBackground",
    module: "aiShoots",
    href: "/model-background",
    label: "换背景",
    shortLabel: "换背景",
    description: "保留主体并替换场景",
    icon: Images,
  },
  {
    key: "pose",
    module: "aiShoots",
    href: "/pose",
    label: "姿势裂变",
    shortLabel: "姿势裂变",
    description: "多姿势、单图或四宫格输出",
    icon: Wand2,
  },
  {
    key: "garment3d",
    module: "aiShoots",
    href: "/garment-3d",
    label: "服装 3D",
    shortLabel: "服装 3D",
    description: "服装立体展示素材",
    icon: Box,
  },
  {
    key: "agent",
    module: "assistant",
    href: "/agent",
    label: "AI 助手",
    shortLabel: "AI 助手",
    description: "聊天、分析与工作流执行",
    icon: Bot,
  },
  {
    key: "textToImage",
    module: "tools",
    href: "/general-image",
    label: "文生图",
    shortLabel: "文生图",
    description: "用文字描述直接生成图片",
    icon: ImagePlus,
  },
  {
    key: "imageToImage",
    module: "tools",
    href: "/general-image/image-to-image",
    label: "图生图",
    shortLabel: "图生图",
    description: "多张参考图结合提示词生成图片",
    icon: Images,
  },
  {
    key: "apiTest",
    module: "tools",
    href: "/api-platform-test",
    label: "API 测试",
    shortLabel: "API 测试",
    description: "模型与接口测试页面",
    icon: ServerCog,
  },
  {
    key: "history",
    module: "works",
    href: "/history",
    label: "我的作品",
    shortLabel: "作品库",
    description: "历史作品与复用",
    icon: History,
  },
];

function isInternalFeatureItem(item: FeatureNavItem) {
  return item.key === "apiTest";
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
  const items = module === "home"
    ? FEATURE_ITEMS.filter((item) => item.module === "aiShoots")
    : FEATURE_ITEMS.filter((item) => item.module === module);

  return SHOW_INTERNAL_NAV ? items : items.filter((item) => !isInternalFeatureItem(item));
}
