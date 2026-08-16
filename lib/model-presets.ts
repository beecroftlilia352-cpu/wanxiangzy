import type { AspectRatio } from "@/lib/api/lingya";
import type { ImagePreviewAction } from "@/lib/studio-image-preview";

export const MODEL_ASPECTS: { value: AspectRatio; label: string; labelKey?: string }[] = [
  { value: "auto", label: "智能", labelKey: "Model.aspects.auto" },
  { value: "3:4", label: "3:4 竖版", labelKey: "Model.aspects.portrait34" },
  { value: "1:1", label: "1:1 头像", labelKey: "Model.aspects.square11" },
  { value: "4:3", label: "4:3 横版", labelKey: "Model.aspects.landscape43" },
];

export type ModelPreviewAction = ImagePreviewAction & { labelKey?: string };

export const MODEL_PREVIEW_ACTIONS: ModelPreviewAction[] = [
  { kind: "download", label: "下载图片", labelKey: "Model.previewActions.download" },
  { kind: "copy", label: "复制链接", labelKey: "Model.previewActions.copy" },
  { kind: "repair", label: "AI修图", labelKey: "Model.previewActions.repair" },
  { kind: "aiVideo", label: "AI视频", labelKey: "Model.previewActions.aiVideo" },
  { kind: "modelBackground", label: "换背景", labelKey: "Model.previewActions.modelBackground" },
  { kind: "pose", label: "姿势裂变", labelKey: "Model.previewActions.pose" },
  { kind: "productSet", label: "商品套图", labelKey: "Model.previewActions.productSet" },
  { kind: "regenerateAll", label: "重新创作", labelKey: "Model.previewActions.regenerateAll" },
  { kind: "feedback", label: "反馈", labelKey: "Model.previewActions.feedback" },
];

export type HairStyleOption = {
  value: string;
  label: string;
  labelKey: string;
  image: string;
};

export const MODEL_HAIR_STYLES: Record<"female" | "male", HairStyleOption[]> = {
  female: [
    { value: "自然黑长直发，偏分，发丝顺滑垂落", label: "黑长直", labelKey: "hairStyles.female.blackLong", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-black-long-side.png" },
    { value: "齐肩短波波头，空气刘海，发尾内扣", label: "短波波", labelKey: "hairStyles.female.shortBob", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-short-bob.png" },
    { value: "高丸子头，干净利落，露出脸部轮廓", label: "丸子头", labelKey: "hairStyles.female.highBun", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-high-bun.png" },
    { value: "侧边低马尾，柔和自然，发束垂在肩侧", label: "侧马尾", labelKey: "hairStyles.female.sidePonytail", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-side-ponytail.png" },
    { value: "长卷发，大波浪，发丝蓬松有层次", label: "大波浪", labelKey: "hairStyles.female.wavy", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-black-wavy.png" },
  ],
  male: [
    { value: "短寸头，清爽硬朗，发际线自然", label: "寸头", labelKey: "hairStyles.male.buzzCut", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/male-buzz-cut.png" },
    { value: "短碎发，顶部自然蓬松，干净少年感", label: "短碎发", labelKey: "hairStyles.male.shortTextured", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/male-short-textured.png" },
    { value: "蓬松微卷短发，前额自然碎刘海", label: "微卷发", labelKey: "hairStyles.male.wavyVolume", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/male-wavy-volume.png" },
  ],
};

export const MODEL_HAIR_COLORS: HairStyleOption[] = [
  { value: "自然黑色", label: "黑色", labelKey: "hairColors.black", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-black-long-side.png" },
  { value: "深棕色", label: "深棕", labelKey: "hairColors.darkBrown", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-brown-straight.png" },
  { value: "冷灰色", label: "灰色", labelKey: "hairColors.coolGray", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-gray-long.png" },
  { value: "铂金白色", label: "白金", labelKey: "hairColors.platinum", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-platinum-long.png" },
  { value: "柔粉色", label: "粉色", labelKey: "hairColors.pink", image: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/exclusive-model/female-pink-long.png" },
];