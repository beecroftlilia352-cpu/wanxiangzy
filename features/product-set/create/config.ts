import type { AspectRatio, LingyaModel } from "@/lib/api/lingya";
import type { ImagePreviewAction } from "@/lib/studio-image-preview";
import {
  PRODUCT_SET_PRESET_PLANS,
  type ProductSetSettings,
} from "@/lib/product-set";
import type { ProductSetPlanSourceTab } from "@/lib/product-set-ui-state";
import type { CustomDraft } from "./types";

export const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "最高4K", badge: "默认", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "最高4K", badge: "高质感", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/openai.svg" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "最高4K", badge: "推荐", icon: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/model-icons/gemini.png" },
];

export const CUSTOM_ASPECTS: AspectRatio[] = ["auto", "3:4", "4:5", "1:1", "4:3", "9:16", "16:9", "3:2", "2:3", "21:9"];

export const PLAN_SOURCE_TABS: { value: ProductSetPlanSourceTab; label: string; description: string }[] = [
  { value: "smart", label: "智能模式", description: "视觉分析" },
  { value: "preset", label: "系统预设", description: "项目模板" },
  { value: "upload", label: "上传模板", description: "自定义参考" },
  { value: "favorites", label: "我的收藏", description: "账号复用" },
];

export const PRODUCT_SET_PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "regenerateOne", label: "重生本张" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "feedback", label: "反馈" },
];

export const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
export const FAVORITE_PRODUCT_SET_PLAN_LIMIT = 24;

export const DEFAULT_REFERENCE_STYLE_BRIEF = `**目标平台：** 未明确

**风格名称：** 方案A：摩登都市奢华风

## 视觉风格
极简高级感，通过大面积留白与硬朗线条展现品牌调性。

## 整组图统一场景
高端艺术画廊或现代建筑中庭，光影错落，营造静谧的奢华感。

## 产品信息
**产品名称：** 老花印花高腰阔腿牛仔裤

**核心卖点：** 经典满印老花工艺，彰显品牌身份，修饰腿型的高腰阔腿剪裁。

## 用户痛点
- [痛点1：普通牛仔裤缺乏设计感，难以在社交场合脱颖而出]
- [痛点2：腿部线条不够完美，需要阔腿版型遮盖缺点]
- [痛点3：大牌质感难以通过图片直观感受]

**适用人群：** 追求时尚品质的都市名媛、职场精英。

## 产品参数
材质：高品质丹宁面料；尺寸：未明确；颜色：经典牛仔蓝配白色印花；功能：修身显瘦、百搭时尚。

## 设计风格
高级/简约/电商质感

## 主题配色
- **主色调：** 纯净白 #FFFFFF（用于背景/大面积色块）
- **辅助色：** 丹宁蓝 #4682B4（用于文字/装饰/图标）
- **点缀色：** 香槟金 #D4AF37（用于高光/强调元素）

## 用户需求原文
无`;

export const DEFAULT_SETTINGS: ProductSetSettings = {
  country: "中国",
  language: "中文",
  platform: "淘宝",
  themeMode: "auto",
  themeColor: "智能主题色",
  fontStyle: "auto",
  stylePackId: "auto",
  extraDescription: "",
  visualDirectorScript: "",
};

export const DEFAULT_DRAFT: CustomDraft = {
  name: "自定义样式",
  typeDescription: "",
  moduleRole: "",
  contentScope: "",
  layoutRules: "",
  textRules: "",
  avoidRules: "",
  aspectRatio: "auto",
  referenceImageUrls: [],
  modelReferenceImageUrls: [],
  otherReferenceImageUrls: [],
  extraDescription: "",
  subjectConsistency: true,
  modelConsistency: false,
  intelligentCopy: true,
  copyDensity: "standard",
};

export function getAspectRatioLabel(value: string) {
  return value === "auto" ? "智能" : value;
}

export function buildReferenceStyleBrief(plan: typeof PRODUCT_SET_PRESET_PLANS[number]) {
  return DEFAULT_REFERENCE_STYLE_BRIEF
    .replace("方案A：摩登都市奢华风", `方案A：${plan.name}参考风格`)
    .replace("无", `选择参考：${plan.name}。${plan.description}`);
}
