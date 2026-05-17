export type TryOnClothingMode = "single" | "multi";
export type TryOnClothingRole = "single" | "upper" | "lower" | "extra";

export const TRYON_CLOTHING_ROLE_LABELS: Record<TryOnClothingRole, string> = {
  single: "连体/全身",
  upper: "上装",
  lower: "下装",
  extra: "搭配单品",
};

export const TRYON_CLOTHING_MODE_LABELS: Record<TryOnClothingMode, string> = {
  multi: "换上下装",
  single: "换连体",
};

export type TryOnRuleImage = {
  url: string;
  title: string;
  role: TryOnClothingRole;
};

export type TryOnRuleDemo = {
  title: string;
  images: TryOnRuleImage[];
};

export type TryOnUploadExampleSlot = "upper" | "lower" | "overall";

export type TryOnUploadRule = {
  mode: TryOnClothingMode;
  title: string;
  shortTitle: string;
  uploadSpecText: string;
  demos: TryOnRuleDemo[];
  deprecatedTitle: string;
  deprecatedImages: { url: string; title: string }[];
};

const BAD_EXAMPLES = [
  { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/My7fD9sD/tryon-rule-bad-occluded-04c6624a07.webp", title: "商品被遮挡" },
  { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/sJzF3yxY/tryon-rule-bad-outfit-baa7169987.webp", title: "套装商品" },
  { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/wZK4pJ73/tryon-rule-bad-blurry-6207ec006b.webp", title: "商品不清晰" },
];

export const TRYON_UPLOAD_SLOT_EXAMPLES: Record<TryOnUploadExampleSlot, TryOnRuleImage[]> = {
  upper: [
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/upper/1-b799382ff9.png", title: "上装示例 1", role: "upper" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/upper/2-1855a74954.png", title: "上装示例 2", role: "upper" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/upper/3-e9afee6f76.png", title: "上装示例 3", role: "upper" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/upper/4-a273a98092.png", title: "上装示例 4", role: "upper" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/upper/5-336d73e233.png", title: "上装示例 5", role: "upper" },
  ],
  lower: [
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/lower/1-819b002ff2.png", title: "下装示例 1", role: "lower" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/lower/2-0c4610360c.png", title: "下装示例 2", role: "lower" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/lower/3-b0ec0885be.png", title: "下装示例 3", role: "lower" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/lower/4-25a338e383.png", title: "下装示例 4", role: "lower" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/lower/5-3c8f9d2cc7.png", title: "下装示例 5", role: "lower" },
  ],
  overall: [
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/overall/1-853f46aa99.png", title: "连体示例 1", role: "single" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/overall/2-183f0bc34e.png", title: "连体示例 2", role: "single" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/overall/3-20d0c6bace.png", title: "连体示例 3", role: "single" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/overall/4-de642994ad.png", title: "连体示例 4", role: "single" },
    { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.8.4.0/dictionary/image/model_tryon/overall/5-291721e018.png", title: "连体示例 5", role: "single" },
  ],
};

const SINGLE_OVERALL_DEMOS: TryOnRuleDemo[] = TRYON_UPLOAD_SLOT_EXAMPLES.overall.map((image, index) => ({
  title: `连体示例 ${index + 1}`,
  images: [image],
}));

const UPPER_LOWER_DEMOS: TryOnRuleDemo[] = TRYON_UPLOAD_SLOT_EXAMPLES.upper.map((upper, index) => {
  const lower = TRYON_UPLOAD_SLOT_EXAMPLES.lower[index];
  return {
    title: `上下装示例 ${index + 1}`,
    images: lower ? [upper, lower] : [upper],
  };
});

export const TRYON_UPLOAD_RULES: Record<TryOnClothingMode, TryOnUploadRule> = {
  single: {
    mode: "single",
    title: "请上传连体/全身服装图，系统会按完整服装处理",
    shortTitle: "连体/全身图",
    uploadSpecText: "图片大小 20KB-15MB，分辨率大于 400x400，支持 jpg/jpeg/png/webp",
    demos: SINGLE_OVERALL_DEMOS,
    deprecatedTitle: "请勿上传以下错误图片，会明显影响生成效果",
    deprecatedImages: BAD_EXAMPLES,
  },
  multi: {
    mode: "multi",
    title: "请分别上传上装与下装，系统会按身体区域处理",
    shortTitle: "上装/下装图",
    uploadSpecText: "每张图片 20KB-15MB，分辨率大于 400x400，可只传上装或下装，也可上下装同时上传",
    demos: UPPER_LOWER_DEMOS,
    deprecatedTitle: "请勿上传以下错误图片，会明显影响生成效果",
    deprecatedImages: BAD_EXAMPLES,
  },
};

export function normalizeTryOnClothingMode(value: unknown): TryOnClothingMode {
  return value === "multi" ? "multi" : "single";
}

export function normalizeTryOnClothingRole(value: unknown, fallback: TryOnClothingRole = "single"): TryOnClothingRole {
  return value === "upper" || value === "lower" || value === "single" || value === "extra" ? value : fallback;
}
