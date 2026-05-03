export type PoseRuleDemo = {
  title: string;
  imageUrl: string;
};

export type PoseUploadRule = {
  title: string;
  shortTitle: string;
  uploadSpecText: string;
  demos: PoseRuleDemo[];
  deprecatedTitle: string;
  deprecatedImages: { url: string; title: string }[];
};

export const POSE_UPLOAD_RULE: PoseUploadRule = {
  title: "请按规则上传商品图，以达到最佳效果",
  shortTitle: "姿势裂变主图",
  uploadSpecText: "图片大小 20KB-15MB，分辨率大于 400x400，支持 jpg/jpeg/png/webp",
  demos: [
    {
      title: "模特图",
      imageUrl: "https://i.ibb.co/G45Q3tXY/pose-rule-literary-female.png",
    },
    {
      title: "模特图",
      imageUrl: "https://i.ibb.co/mFPyCqLJ/pose-rule-cute-girl.png",
    },
    {
      title: "模特图",
      imageUrl: "https://i.ibb.co/RGqxTDLd/pose-rule-elegant-dress.png",
    },
    {
      title: "模特图",
      imageUrl: "https://i.ibb.co/ZRkFNkR9/pose-rule-child-blue.png",
    },
    {
      title: "模特图",
      imageUrl: "https://i.ibb.co/xt1psGDv/pose-rule-sweet-child.webp",
    },
  ],
  deprecatedTitle: "请勿上传以下错误图片，会明显影响生成效果",
  deprecatedImages: [
    { url: "https://i.ibb.co/RT2RxF0g/pose-rule-bad-occluded.png", title: "服装被遮挡" },
    { url: "https://i.ibb.co/wDF0Sw3/pose-rule-bad-no-model.webp", title: "无模特出镜" },
    { url: "https://i.ibb.co/SXMKMXWQ/pose-rule-bad-ad-text.webp", title: "牛皮癣类图片" },
  ],
};
