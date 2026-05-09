export type TryOnClothingMode = "single" | "multi";
export type TryOnClothingRole = "single" | "upper" | "lower" | "extra";

export const TRYON_CLOTHING_ROLE_LABELS: Record<TryOnClothingRole, string> = {
  single: "单件服装",
  upper: "上装",
  lower: "下装",
  extra: "搭配单品",
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

export const TRYON_UPLOAD_RULES: Record<TryOnClothingMode, TryOnUploadRule> = {
  single: {
    mode: "single",
    title: "请按规则上传单件服装图，以达到最佳效果",
    shortTitle: "单件服装图",
    uploadSpecText: "图片大小 20KB-15MB，分辨率大于 400x400，支持 jpg/jpeg/png/webp",
    demos: [
      {
        title: "上装平铺图",
        images: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/KxGCdVfv/tryon-rule-single-shirt-a8f6bfa6b7.webp", title: "上装平铺图", role: "single" }],
      },
      {
        title: "连体衣平铺图",
        images: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/5h2vMSmt/tryon-rule-single-dress-7c19630f22.webp", title: "连体衣平铺图", role: "single" }],
      },
      {
        title: "上装平铺图",
        images: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/k6sSH0Ms/tryon-rule-single-flat-top-1899174396.webp", title: "上装平铺图", role: "single" }],
      },
      {
        title: "真人服装图",
        images: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/dJKCp3Mx/tryon-rule-single-model-1-1c8410f33a.webp", title: "真人服装图", role: "single" }],
      },
      {
        title: "真人服装图",
        images: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/zWf2MkHL/tryon-rule-single-model-2-35f73d2f7b.webp", title: "真人服装图", role: "single" }],
      },
    ],
    deprecatedTitle: "请勿上传以下错误图片，会明显影响生成效果",
    deprecatedImages: BAD_EXAMPLES,
  },
  multi: {
    mode: "multi",
    title: "请按规则上传多件服装图，以达到最佳效果",
    shortTitle: "多件搭配图",
    uploadSpecText: "每张图片 20KB-15MB，分辨率大于 400x400，建议上装、下装分开上传",
    demos: [
      {
        title: "搭配 1",
        images: [
          { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/218YgwPp/tryon-rule-multi-1-upper-98ee90bad4.webp", title: "上装平铺图", role: "upper" },
          { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/hFjyDMjH/tryon-rule-multi-1-lower-d4e85fa849.webp", title: "下装平铺图", role: "lower" },
        ],
      },
      {
        title: "搭配 2",
        images: [
          { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/d4wfC6Th/tryon-rule-multi-2-upper-e8365a0cea.webp", title: "上装平铺图", role: "upper" },
          { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/vx37VJ8n/tryon-rule-multi-2-lower-a90989b977.webp", title: "下装平铺图", role: "lower" },
        ],
      },
      {
        title: "搭配 3",
        images: [
          { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/jkgMZsmM/tryon-rule-multi-3-upper-d6976f78a7.webp", title: "真人服装图", role: "upper" },
          { url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/i.ibb.co/JSGhYpS/tryon-rule-multi-3-lower-d267b7a71d.webp", title: "真人服装图", role: "lower" },
        ],
      },
    ],
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
