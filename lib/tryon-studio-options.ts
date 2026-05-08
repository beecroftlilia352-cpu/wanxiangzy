import type { AspectRatio, LingyaModel } from "@/lib/api/lingya";
import type { TryOnSceneMode } from "@/lib/tryon-scene";
import type { TryOnAgeGroup, TryOnGarmentAudience } from "@/lib/tryon-prompt";

const SUPABASE_STORAGE = "https://mtdfvnhphpulhjtnmubw.supabase.co/storage/v1/object/public";

export const PRESET_MODELS = [
  { id: "m0", name: "自然", image_url: `${SUPABASE_STORAGE}/models/model-natural-smile.jpg`, gender: "female" as const },
  { id: "m1", name: "甜妹", image_url: `${SUPABASE_STORAGE}/models/model-18542-0875a4d282bb.jpg`, gender: "female" as const },
  { id: "m2", name: "优雅", image_url: `${SUPABASE_STORAGE}/models/model-22921-89d4664cd1b0.jpg`, gender: "female" as const },
  { id: "m3", name: "红裙", image_url: `${SUPABASE_STORAGE}/models/model-26829-dca5c791efa8.jpg`, gender: "female" as const },
  { id: "m4", name: "酷飒", image_url: `${SUPABASE_STORAGE}/models/model-97612-bdc397740113.jpg`, gender: "female" as const },
  { id: "m5", name: "清纯", image_url: `${SUPABASE_STORAGE}/models/model-35127-693ee11382eb.png`, gender: "female" as const },
  { id: "m6", name: "清透", image_url: `${SUPABASE_STORAGE}/models/model-clear-black-long-20260502.png`, gender: "female" as const },
];

export const PRESET_REFERENCES = [
  { id: "r1", url: `${SUPABASE_STORAGE}/references/reference-108513-b6db713a5d2f.jpg`, label: "白T街头", category: "scene" as const },
  { id: "r2", url: `${SUPABASE_STORAGE}/references/reference-56020-dc1aa74e5515.jpg`, label: "黑蕾丝夜景", category: "style" as const },
  { id: "r3", url: `${SUPABASE_STORAGE}/references/reference-23353-c281a160d01d.jpg`, label: "白衫桥边", category: "style" as const },
  { id: "r4", url: `${SUPABASE_STORAGE}/references/reference-soft-blue-cardigan.jpg`, label: "蓝衫光影", category: "pose" as const },
  { id: "r5", url: `${SUPABASE_STORAGE}/references/reference-white-top-denim-shorts.jpg`, label: "白顶牛仔", category: "pose" as const },
  { id: "r6", url: `${SUPABASE_STORAGE}/references/reference-mens-black-knitwear.jpg`, label: "男款木墙", category: "pose" as const },
  { id: "r7", url: `${SUPABASE_STORAGE}/references/reference-grey-tank-denim-culottes.jpg`, label: "灰背心牛仔", category: "style" as const },
  { id: "r8", url: `${SUPABASE_STORAGE}/references/reference-striped-top-white-skirt.png`, label: "条纹白裙", category: "scene" as const },
  { id: "r9", url: `${SUPABASE_STORAGE}/references/reference-cafe-wide-leg-pants.jpg`, label: "咖啡阔腿", category: "scene" as const },
];

export const MODELS: { value: LingyaModel; label: string; desc: string; badge?: string; icon: string }[] = [
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "4K · 4分/次", badge: "最新", icon: "/model-icons/openai.svg" },
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "4K · 3分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "4K · 4分/次", badge: "推荐", icon: "/model-icons/gemini.png" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5", desc: "4K · 2分/次", badge: "新", icon: "/model-icons/doubao.png" },
];

export const GPT_ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4 竖版" }, { value: "4:3", label: "4:3 横版" },
  { value: "1:1", label: "1:1 方形" }, { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 手机" }, { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" }, { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" }, { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动" },
];

export const BANANA_ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "3:4", label: "3:4" }, { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" }, { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" }, { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" }, { value: "21:9", label: "21:9" },
  { value: "auto", label: "自动" },
];

export const STYLE_PRESETS = [
  "服装纹理更清晰，保留面料厚度和真实褶皱",
  "人物肤色自然真实，不要过白、不要磨皮",
  "边缘干净清楚，避免衣服轮廓发糊",
  "保持原图光线方向，阴影自然不过曝",
  "人物比例稳定，肩颈、手臂和腿部不变形",
  "商品细节完整可见，logo、纽扣、拉链不丢失",
];

export const GARMENT_AUDIENCE_OPTIONS: TryOnGarmentAudience[] = ["women", "men"];
export const AGE_GROUP_OPTIONS: TryOnAgeGroup[] = ["adult", "teen", "big_child", "middle_child", "small_child", "toddler"];

export const SCENE_MODE_TABS: Array<{ value: TryOnSceneMode; label: string }> = [
  { value: "auto_design", label: "智能模式" },
  { value: "system_reference", label: "系统预设" },
  { value: "upload_reference", label: "上传" },
  { value: "favorites", label: "收藏" },
];
