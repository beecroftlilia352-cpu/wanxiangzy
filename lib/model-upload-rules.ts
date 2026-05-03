export type ModelRuleDemo = {
  title: string;
  description: string;
  imageUrls: string[];
};

export type ModelUploadRule = {
  title: string;
  shortTitle: string;
  uploadSpecText: string;
  demos: ModelRuleDemo[];
  deprecatedTitle: string;
  deprecatedImages: { url: string; title: string }[];
};

const MODEL_STORAGE = "https://mtdfvnhphpulhjtnmubw.supabase.co/storage/v1/object/public/models";

export const MODEL_UPLOAD_RULE: ModelUploadRule = {
  title: "请按规则上传人物参考图，以获得更稳定的融合模特",
  shortTitle: "专属模特参考图",
  uploadSpecText: "上传 1-3 张清晰正脸/半身人物图，单张 20KB-15MB，分辨率大于 400x400，支持 jpg/jpeg/png/webp",
  demos: [
    {
      title: "单图参考",
      description: "单人清晰正脸，适合快速建立干净自然的基础模特",
      imageUrls: [
        "https://i.ibb.co/1t3zJ4KZ/model-rule-fusion-1.png",
      ],
    },
    {
      title: "双图融合",
      description: "融合脸型、肤色和温柔气质，不复制某一张脸",
      imageUrls: [
        "https://i.ibb.co/1t3zJ4KZ/model-rule-fusion-1.png",
        "https://i.ibb.co/0jD58PgS/fa230972-f679-4189-9764-cdb5773d7a3d.png",
      ],
    },
    {
      title: "三图融合",
      description: "三图融合脸型骨相、五官比例、妆感和整体氛围",
      imageUrls: [
        "https://i.ibb.co/1t3zJ4KZ/model-rule-fusion-1.png",
        "https://i.ibb.co/0jD58PgS/fa230972-f679-4189-9764-cdb5773d7a3d.png",
        "https://i.ibb.co/spXm4d0B/model-rule-fusion-3.png",
      ],
    },
  ],
  deprecatedTitle: "请勿上传以下类型，会明显降低融合稳定性",
  deprecatedImages: [
    { url: `${MODEL_STORAGE}/model-26829-dca5c791efa8.jpg`, title: "遮挡过多" },
    { url: `${MODEL_STORAGE}/model-65245-a92f45dd88c9.jpg`, title: "姿态偏侧" },
    { url: `${MODEL_STORAGE}/model-179593-1832ed333c13.jpg`, title: "光线复杂" },
  ],
};
