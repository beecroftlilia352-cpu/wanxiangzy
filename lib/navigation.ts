import {
  Bot,
  Box,
  Brush,
  Camera,
  Clapperboard,
  GalleryHorizontalEnd,
  Heart,
  History,
  Home,
  Images,
  PersonStanding,
  ScanFace,
  ServerCog,
  Shirt,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type AppModuleKey = "home" | "aiShoots" | "aiRestyle" | "sketch" | "tools" | "aiVideo" | "works";

export type FeatureKey =
  | "home"
  | "agent"
  | "tryon"
  | "faceSwap"
  | "grass"
  | "modelBackground"
  | "pose"
  | "model"
  | "garment3d"
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

export const TOP_MODULES: TopModuleNavItem[] = [
  { key: "aiShoots", href: "/create", label: "AI Shoots", icon: Camera },
  { key: "aiRestyle", href: "/pose", label: "AI Restyle", icon: Wand2 },
  { key: "sketch", href: "/agent", label: "Sketch", icon: Brush },
  { key: "tools", href: "/garment-3d", label: "Tools", icon: Sparkles },
  { key: "aiVideo", href: "/agent?intent=video", label: "AI Video", icon: Clapperboard, comingSoon: true },
  { key: "works", href: "/history", label: "Works Gallery", icon: GalleryHorizontalEnd },
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
    label: "Virtual Try-on",
    shortLabel: "换装",
    description: "服装上身与模特试穿",
    icon: Shirt,
  },
  {
    key: "model",
    module: "aiShoots",
    href: "/model",
    label: "AI Model",
    shortLabel: "模特生成",
    description: "生成专属模特",
    icon: PersonStanding,
  },
  {
    key: "faceSwap",
    module: "aiShoots",
    href: "/face-swap",
    label: "Swap Face",
    shortLabel: "AI 换脸",
    description: "只替换面部五官",
    icon: ScanFace,
  },
  {
    key: "grass",
    module: "aiShoots",
    href: "/grass",
    label: "AI Lookbook",
    shortLabel: "种草图",
    description: "小红书/内容种草图",
    icon: Heart,
  },
  {
    key: "modelBackground",
    module: "aiRestyle",
    href: "/model-background",
    label: "Change Background",
    shortLabel: "换背景",
    description: "保留主体替换场景",
    icon: Images,
  },
  {
    key: "pose",
    module: "aiRestyle",
    href: "/pose",
    label: "Pose Variation",
    shortLabel: "姿势裂变",
    description: "多姿势/四宫格",
    icon: Wand2,
  },
  {
    key: "garment3d",
    module: "tools",
    href: "/garment-3d",
    label: "Flat Lay Generator",
    shortLabel: "服装 3D",
    description: "服装立体展示素材",
    icon: Box,
  },
  {
    key: "agent",
    module: "sketch",
    href: "/agent",
    label: "AI Agent",
    shortLabel: "智能助手",
    description: "聊天、分析与工作流",
    icon: Bot,
  },
  {
    key: "apiTest",
    module: "tools",
    href: "/api-platform-test",
    label: "API Lab",
    shortLabel: "API 测试",
    description: "模型/API 测试页面",
    icon: ServerCog,
  },
  {
    key: "history",
    module: "works",
    href: "/history",
    label: "My Creations",
    shortLabel: "作品库",
    description: "历史作品与复用",
    icon: History,
  },
];

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
  if (module === "home") return FEATURE_ITEMS.filter((item) => item.module === "aiShoots");
  return FEATURE_ITEMS.filter((item) => item.module === module);
}
