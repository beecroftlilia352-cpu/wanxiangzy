export type Garment3dRuleDemo = {
  title: string;
  description: string;
  imageUrl: string;
  garmentType: "上装" | "下装" | "连体衣" | "其他";
};

export type Garment3dUploadRule = {
  title: string;
  shortTitle: string;
  uploadSpecText: string;
  demos: Garment3dRuleDemo[];
  deprecatedTitle: string;
  deprecatedImages: { url: string; title: string }[];
};

export const GARMENT_3D_UPLOAD_RULE: Garment3dUploadRule = {
  title: "请按规则上传图片，以达到最佳效果",
  shortTitle: "服装 3D 输入图",
  uploadSpecText: "图片大小 20KB-15MB，分辨率大于 400x400，支持 jpg/jpeg/png/webp",
  demos: [
    {
      title: "卫衣",
      description: "单件衣服平铺图，主体完整清晰，适合还原厚度、帽口、袖口和下摆结构",
      imageUrl: "https://i.ibb.co/Jj0czQ6N/garment-3d-rule-hoodie.png",
      garmentType: "上装",
    },
    {
      title: "外套",
      description: "外套主体完整、边缘干净，适合转成棚拍立体服装展示",
      imageUrl: "https://i.ibb.co/ktxtLWF/garment-3d-rule-jacket.png",
      garmentType: "上装",
    },
    {
      title: "短袖",
      description: "正面平铺、图案和版型清楚，适合还原衣身厚度和面料细节",
      imageUrl: "https://i.ibb.co/KcbND0sj/garment-3d-rule-tshirt.png",
      garmentType: "上装",
    },
    {
      title: "裤子",
      description: "裤装完整无遮挡，适合保留腰头、裤腿、褶皱和垂坠轮廓",
      imageUrl: "https://i.ibb.co/hR6BNJBx/garment-3d-rule-pants.png",
      garmentType: "下装",
    },
    {
      title: "连体衣",
      description: "单件连体服装，主体干净完整，适合保留整体版型和开口结构",
      imageUrl: "https://i.ibb.co/TxFj1mQV/garment-3d-rule-bodysuit.webp",
      garmentType: "连体衣",
    },
  ],
  deprecatedTitle: "请勿上传以下错误图片，会明显影响生成效果",
  deprecatedImages: [
    { url: "https://i.ibb.co/RT2RxF0g/pose-rule-bad-occluded.png", title: "商品被遮挡" },
    { url: "https://i.ibb.co/cXgd59wD/garment-3d-rule-bad-outfit.png", title: "套装商品" },
    { url: "https://i.ibb.co/FbQqxjBv/garment-3d-rule-bad-blurry.png", title: "商品不清晰" },
    { url: "https://i.ibb.co/RpS0mtTF/garment-3d-rule-bad-bg.png", title: "背景杂乱" },
  ],
};
