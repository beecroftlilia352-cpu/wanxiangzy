import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import type { ImagePreviewReference, ImagePreviewReferenceRole } from "@/lib/studio-image-preview";

export type OutfitFusionAssetRole = "outfit" | "reference" | "model";

export type OutfitFusionAsset = {
  id: string;
  role: OutfitFusionAssetRole;
  url: string;
  name?: string;
};

export type OutfitFusionTemplate = {
  id: string;
  title: string;
  prompt: string;
  coverUrl: string;
  assets: OutfitFusionAsset[];
  resultUrls: string[];
  outputCount: number;
};

export type OutfitFusionQuality = "standard" | "hd" | "ultra";

export type OutfitFusionConfig = {
  aspectRatio: Extract<AspectRatio, "auto" | "1:1" | "3:4">;
  genCount: number;
  imageSize: ImageSize;
  aiModel: LingyaModel;
  quality: OutfitFusionQuality;
};

export const OUTFIT_FUSION_MODELS: Array<{ value: LingyaModel; label: string; desc: string }> = [
  { value: "nano-banana-2", label: "Nano-Banana-2", desc: "高性价比，适合批量出图" },
  { value: "gpt-image-2", label: "GPT-Image-2", desc: "细节稳定，适合复杂多物件" },
  { value: "nano-banana-pro", label: "Nano-Banana-Pro", desc: "质感更强，适合品牌大片" },
];

export const OUTFIT_FUSION_QUALITY_OPTIONS: Array<{ value: OutfitFusionQuality; label: string; desc: string }> = [
  { value: "standard", label: "标准", desc: "快速预览" },
  { value: "hd", label: "高清", desc: "细节增强" },
  { value: "ultra", label: "超清", desc: "高质感精修" },
];

export const DEFAULT_OUTFIT_FUSION_CONFIG: OutfitFusionConfig = {
  aspectRatio: "auto",
  genCount: 4,
  imageSize: "1K",
  aiModel: "nano-banana-2",
  quality: "hd",
};

export function buildOutfitFusionVisibleFaceText(imageLabel: string) {
  const label = imageLabel.trim() || "模特图";
  return `把模特换成${label}的模特，保留${label}模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型`;
}

function applyOutfitFusionVisibleFaceText(prompt: string) {
  return prompt.replace(
    /把模特换成(图\d+)的模特(?:(?:，|：|:)[^。]*?(?:通用新脸|身份特征|发色及发型))?/g,
    (_match, imageLabel: string) => buildOutfitFusionVisibleFaceText(imageLabel)
  );
}

export function buildOutfitFusionHiddenFaceConstraints(input: {
  assets: OutfitFusionAsset[];
  visiblePrompt?: string;
}) {
  const modelIndex = input.assets.findIndex((asset) => asset.role === "model");
  if (modelIndex < 0) return "";

  const modelRef = getOutfitFusionAssetLabel(input.assets[modelIndex], modelIndex);
  const referenceIndex = input.assets.findIndex((asset) => asset.role === "reference");
  const referenceRef = referenceIndex >= 0 ? getOutfitFusionAssetLabel(input.assets[referenceIndex], referenceIndex) : "";
  const referenceText = referenceRef
    ? `${referenceRef}只提供身体、姿态、头部位置、头部大小、颈肩衔接、表情方向、肤色明暗、妆容、构图、背景和光影；即使${referenceRef}里有人脸，也不得保留其原脸身份、脸型、眼鼻嘴或可识别特征。`
    : "如果画面基础图里有人脸，不得保留其原脸身份、脸型、眼鼻嘴或可识别特征。";

  return [
    "【后台隐藏脸部约束，仅用于生成执行，不要写进用户输入框】",
    `${modelRef}是最终脸部身份唯一来源。最终脸必须一眼像${modelRef}本人；如果最终脸仍像参考图原人物、随机陌生人、通用网红脸或两张脸平均融合，即使服装正确也判定失败。`,
    `${modelRef}控制脸型轮廓、眼形眼距、眉形、鼻梁/鼻尖/鼻翼、嘴形、五官比例、骨相、可识别相似度、发色和发型；不得为了贴合参考图而改变这些身份特征。`,
    referenceText,
    "自然融合只允许调整表情肌肉、视线、肤色重打光、妆容匹配、毛孔、阴影、边缘融合和脸颈/身体肤色连续性；不得改变模特脸图的脸型轮廓、五官结构、五官比例或身份相似度。",
    `优先级：脸部身份以${modelRef}为最高优先；参考图在人脸上只控制头部角度、表情方向、头部空间、肤色光影和自然衔接；搭配图只控制商品。禁止只换发型或妆感但不保留${modelRef}五官身份。`,
  ].join(" ");
}

export const OUTFIT_FUSION_TEMPLATES: OutfitFusionTemplate[] = ([
  {
    id: "7839001",
    title: "轻熟通勤多件套",
    prompt: "让图1的人物姿态、构图和场景氛围作为画面基础，头戴图2的棕色平顶帽，身穿图3的蓝色无袖上衣，搭配图4的白色半身裙，手持图5的棕色手提包，把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN019Cu8zE1EcsrHtNUWm_-6000000000373-2-tps-3520-4693-acc7264244.png",
    assets: [
      { id: "7839001-1", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01yslKdz1CnIdSzUGA3_-6000000000125-0-tps-1104-1472-59c00277f7.jpg" },
      { id: "7839001-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01RYn4xW1yVzDjJD7HN_-6000000006585-0-tps-1024-1032-5131d7ff2f.jpg" },
      { id: "7839001-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01v16hIZ1Jx6QIkgS4N_-6000000001094-0-tps-1024-1016-9c5561c21c.jpg" },
      { id: "7839001-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01BbZtq51kHsOimn9ya_-6000000004659-0-tps-1024-1032-b7494a9cb4.jpg" },
      { id: "7839001-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN014PHmy51LeRWCiDuV5_-6000000001324-0-tps-1024-1016-ef74e16b9e.jpg" },
      { id: "7839001-6", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01k7OCfB1qCje8IISOI_-6000000005460-0-tps-1440-1891-fa9cbb847b.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN019Cu8zE1EcsrHtNUWm_-6000000000373-2-tps-3520-4693-acc7264244.png"],
  },
  {
    id: "7839002",
    title: "图书馆秋冬层次",
    prompt: "让图6的人物姿态、构图和场景氛围作为画面基础，身穿图1的灰色长裙，手持图2的黑色菱格纹手提包，脚穿图3的黑色漆皮尖头高跟鞋，外搭图4的深棕色毛呢外套并佩戴图4的绿色图案丝巾，内搭图5的浅蓝色长袖衬衫，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01ge3fYu1tqWuIDP9O1_-6000000005953-0-tps-3520-4693-a38b93a75e.jpg",
    assets: [
      { id: "7839002-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01NaOW3X20b8uXpb3Wk_-6000000006867-0-tps-1024-1019-4ef8af4e52.jpg" },
      { id: "7839002-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01jJtIAX1EeiRaa6et4_-6000000000377-0-tps-1024-1024-eeb5433ee9.jpg" },
      { id: "7839002-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01vAvtR71lD7uEdbGlI_-6000000004784-0-tps-1024-1038-30799d52e9.jpg" },
      { id: "7839002-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01jmhKa61fcsTpkmVzE_-6000000004028-0-tps-1024-1024-2bcadad7a4.jpg" },
      { id: "7839002-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Qt0DZY29RN0AiTaAk_-6000000008064-0-tps-1024-1029-cecb901c58.jpg" },
      { id: "7839002-6", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01pG0cpk1mjvtLMY9Gj_-6000000004991-0-tps-1104-1472-3378a5a817.jpg" },
      { id: "7839002-7", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01zug3D91jAial3v3lp_-6000000004508-0-tps-864-1184-eef13cd1b5.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01ge3fYu1tqWuIDP9O1_-6000000005953-0-tps-3520-4693-a38b93a75e.jpg"],
  },
  {
    id: "7839004",
    title: "度假浅灰套装",
    prompt: "让图8的人物姿态、构图和场景氛围作为画面基础，身穿图2的浅灰色吊带连衣裙，外搭图3的浅灰色花卉图案马甲，头戴图4的米色编织帽子，颈间系着或手持图5的浅蓝色菠萝图案围巾，脚穿图1的银色高跟凉鞋，手持图6的绿色菱格纹手提包，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01EFPiFR23sUlSb0vwj_-6000000007311-2-tps-3072-4096-c981504ed0.png",
    assets: [
      { id: "7839004-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01vIOISc1TKlQVtySR6_-6000000002364-0-tps-1016-1024-fae3a733f3.jpg" },
      { id: "7839004-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01RW9Y8v1OyXkRU2izV_-6000000001774-0-tps-1024-1032-7165a45081.jpg" },
      { id: "7839004-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01nF3mv22A4IfRGLCAs_-6000000008149-0-tps-1424-1424-3832b71892.jpg" },
      { id: "7839004-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01VemS1x1VnjiFwsCyo_-6000000002698-0-tps-1024-1025-dc3d71af42.jpg" },
      { id: "7839004-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN014VG9pO1dbNxTD9shd_-6000000003754-0-tps-1360-1360-bab3d944f5.jpg" },
      { id: "7839004-6", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01l5rKUo27tBpOiWRHV_-6000000007854-0-tps-1024-1024-c8a65c83d5.jpg" },
      { id: "7839004-7", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01U7Mt0t1PkAwH4k4IK_-6000000001878-2-tps-467-640-64ba5a703b.png" },
      { id: "7839004-8", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01qyGOO01Qj5cDwUINL_-6000000002011-0-tps-1104-1472-f1f0eb8444.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01EFPiFR23sUlSb0vwj_-6000000007311-2-tps-3072-4096-c981504ed0.png"],
  },
  {
    id: "7840002",
    title: "机能风深色套装",
    prompt: "让图6的人物姿态、构图和场景氛围作为画面基础，脚穿图1的黑色皮质鞋子，手持图2的黑色手提包，身穿图3的米色工装裤，内搭图4的黑色长袖衬衫，外搭图5的灰色羊羔绒领夹克，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01tAg6li1tP38uu9UPk_-6000000005893-2-tps-3520-4693-e77c4f1266.png",
    assets: [
      { id: "7840002-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01EtNGX01Sg0B1zMKSw_-6000000002275-0-tps-1024-1032-0b3c87c8ea.jpg" },
      { id: "7840002-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN012sAVDc1eOqjWj6exm_-6000000003862-0-tps-1016-1032-73affc7213.jpg" },
      { id: "7840002-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01Vvcisb24avBNpsGCo_-6000000007408-0-tps-1360-1360-0c9276868c.jpg" },
      { id: "7840002-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01SGgkeU1ZXU7dHbODf_-6000000003204-0-tps-1024-1029-d79b0e965c.jpg" },
      { id: "7840002-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01bkPWk01JsyrIAA2hJ_-6000000001085-0-tps-1024-1024-b01df5ab5c.jpg" },
      { id: "7840002-6", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01D4lHEU1PNH8Sokz44_-6000000001828-0-tps-1104-1472-92f99eeab1.jpg" },
      { id: "7840002-7", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01gyyKNQ1y0NtMi5kGN_-6000000006516-0-tps-467-640-4cdfab1e6a.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01tAg6li1tP38uu9UPk_-6000000005893-2-tps-3520-4693-e77c4f1266.png"],
  },
  {
    id: "7840003",
    title: "海岛运动混搭",
    prompt: "让图8的人物姿态、构图和场景氛围作为画面基础，头戴图1的白色运动帽，身穿图2的浅蓝色短袖T恤，佩戴图3的棕色方形太阳镜，身穿图4的紫色宽松裤子，脚穿图5的蓝色PUMA运动鞋，佩戴图6的浅灰色布质腰包，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01TzHP7m1eY0eeHY97a_-6000000003882-0-tps-3520-4693-d6f57c42d8.jpg",
    assets: [
      { id: "7840003-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01AUuZy51kzqQ6D2YuB_-6000000004755-0-tps-1016-1024-afb112e920.jpg" },
      { id: "7840003-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01A8RTWn1dVtCnqCQNx_-6000000003742-0-tps-1016-1024-f1f1985fe6.jpg" },
      { id: "7840003-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01Pi9nh51WTs9PGA9PZ_-6000000002790-2-tps-864-857-0e3ec0a331.png" },
      { id: "7840003-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN018n5WEU1Mhw9iynkJX_-6000000001467-0-tps-1360-1360-c750e7fecf.jpg" },
      { id: "7840003-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01sYqXOv1WdUT5RvROH_-6000000002811-0-tps-1024-1019-9fb189fd4c.jpg" },
      { id: "7840003-6", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01VpYZ5g1Qcg4QvVXYj_-6000000001997-0-tps-1024-1032-86b1f9ce13.jpg" },
      { id: "7840003-7", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01mV6tFe1aGpKfgp1Xr_-6000000003303-2-tps-467-640-2d267e33da.png" },
      { id: "7840003-8", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01yc6PPM1nrY5raA73L_-6000000005143-0-tps-1104-1472-5ad9773340.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01TzHP7m1eY0eeHY97a_-6000000003882-0-tps-3520-4693-d6f57c42d8.jpg"],
  },
  {
    id: "7840004",
    title: "法式街景黑白红",
    prompt: "让自然商业女模特身穿图1的白色花卉图案衬衫，搭配图2的黑色短裤，脚穿图3的黑色蝴蝶结高跟靴子，外搭图4的黑色风衣外套，手持图5的红色皮质手提包并搭配图5的花纹丝巾，把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型。姿势：站立，身体微微侧转，头部自然抬起看向镜头，双手自然垂放，肩部放松，姿态优雅自信。背景：具有岁月感的米色石灰岩建筑立面，远处虚化的欧式铸铁栏杆或咖啡馆遮阳篷，营造沉稳的异域度假氛围。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN012G0jg41aiJ62eo9t4_-4611686018427383075-0-aigc_biz_alg-a7760ffd5c.jpg",
    assets: [
      { id: "7840004-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01vp2TwC1QlNb0WgFo6_-6000000002016-0-tps-1360-1360-411122ab9f.jpg" },
      { id: "7840004-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01ZM4bXc1pA9njp08v7_-6000000005319-0-tps-1360-1360-e0f95e2d39.jpg" },
      { id: "7840004-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01NOG1Gc1imtzpWQshG_-6000000004456-0-tps-1024-1024-1d697c9d34.jpg" },
      { id: "7840004-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01m5Uvkg1bKmMlA9abu_-6000000003447-2-tps-1024-1024-9b2c9c0171.png" },
      { id: "7840004-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01LnWUaw1p3kFxAIKgg_-6000000005305-0-tps-1360-1360-bd30c81d0e.jpg" },
      { id: "7840004-6", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN014C5mKw1pfl6dvGtea_-4611686018427385100-0-aigc_biz_alg-df6d322d04.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN012G0jg41aiJ62eo9t4_-4611686018427383075-0-aigc_biz_alg-a7760ffd5c.jpg"],
  },
  {
    id: "7842001",
    title: "雪线户外多层叠穿",
    prompt: "让图8的人物姿态、构图和场景氛围作为画面基础，身穿图1的黑色牛仔夹克，手持图2的黑色手提包，颈部佩戴图3的黑色针织围巾，脚穿图4的棕色系带靴子，叠穿图5的灰色夹克，头戴图6的米色蓝红雪花图案针织帽，身穿图7的黑色宽腿牛仔裤，把模特换成图9的模特，保留图9模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN019gcRJS1DwI1Zg3Mxz_-6000000000280-2-tps-3520-4693-17a8a3d423.png",
    assets: [
      { id: "7842001-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01MwQQla1U5TpFJ8OHb_-6000000002466-0-tps-1024-1019-b8fff2d85d.jpg" },
      { id: "7842001-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01cE89Q91kA5fGvdiNt_-6000000004642-0-tps-1024-1024-9aa99d942c.jpg" },
      { id: "7842001-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01rjWoab1PV3ruqvuAL_-6000000001845-0-tps-1024-1016-014dbae157.jpg" },
      { id: "7842001-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01p6hd2N23G1Ujevv94_-6000000007227-0-tps-1024-1024-69a3272bf2.jpg" },
      { id: "7842001-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN019alDDb1IuWZtpzxWX_-6000000000953-0-tps-1024-1016-63bbf5c5e2.jpg" },
      { id: "7842001-6", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01FDLFcn1aoidpWn91y_-6000000003377-0-tps-1024-1020-72277fe68d.jpg" },
      { id: "7842001-7", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01LU4YbR1ksW5CJOTHb_-6000000004739-0-tps-1024-1032-7d3ff6ea42.jpg" },
      { id: "7842001-8", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01KwFovd1FkxSSRiITl_-6000000000526-0-tps-1104-1472-aa70fb5c47.jpg" },
      { id: "7842001-9", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN013tRneq1aVwOwvJOno_-6000000003336-2-tps-467-640-751d1556b6.png" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN019gcRJS1DwI1Zg3Mxz_-6000000000280-2-tps-3520-4693-17a8a3d423.png"],
  },
  {
    id: "7842002",
    title: "庭院男装轻机能",
    prompt: "让图5的人物姿态、构图和场景氛围作为画面基础，脚穿图1的白色运动鞋，手持图2的黑色手提包，身穿图3的黑色夹克，搭配图4的灰色工装短裤和棕色皮质腰带，把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01E50D3s1GlhidLhC4L_-6000000000663-0-tps-2792-3720-5c402516f7.jpg",
    assets: [
      { id: "7842002-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01OvOmnC1TtZWn1npiX_-6000000002440-0-tps-1024-1032-527035c581.jpg" },
      { id: "7842002-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01cE89Q91kA5fGvdiNt_-6000000004642-0-tps-1024-1024-9aa99d942c.jpg" },
      { id: "7842002-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN019pFjtt1UkF4eVjUOS_-6000000002555-0-tps-1024-1016-ceca40957e.jpg" },
      { id: "7842002-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01b1FH5n1FuZm7jcB4u_-6000000000547-0-tps-1024-1032-8d82f8dafa.jpg" },
      { id: "7842002-5", role: "reference", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01DWBdbK27WI1aA493R_-6000000007804-0-tps-908-1210-b42d8c2de1.jpg" },
      { id: "7842002-6", role: "model", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01te0mUE1u71AE0Qcng_-6000000005989-0-tps-2314-3086-effca89d7b.jpg" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01E50D3s1GlhidLhC4L_-6000000000663-0-tps-2792-3720-5c402516f7.jpg"],
  },
  {
    id: "5348001",
    title: "雪山儿童户外",
    prompt: "让8岁欧美男童模特穿上图1的黄色格纹羽绒服，穿上图2的棕色宽松裤子，脚穿图3的红色和黄色运动鞋，戴上图4的彩色图案针织帽，背着图5的绿色单肩包，带有棕色肩带和扣件。动作：正面站立，一手插兜；场景：雪山脚下或高原草甸，自然光，突出防风保暖与版型。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01KjRuPD1UV7yhMNs2R_-6000000002522-2-tps-1417-1889-b7398944f6.png",
    assets: [
      { id: "5348001-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01QRMlcl1ZQ9l2wlVYd_-6000000003188-2-tps-1000-1000-51374740d6.png" },
      { id: "5348001-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01eCkC4x1pVgOBVYXNW_-6000000005366-2-tps-1000-1000-5f051eed65.png" },
      { id: "5348001-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01S6qSgq1tBld13Of5q_-6000000005864-2-tps-1024-1024-f0a4d772cf.png" },
      { id: "5348001-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Taz9vJ1yRrd2UegbZ_-6000000006576-2-tps-992-992-b91b624f26.png" },
      { id: "5348001-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01grcKDv1KRKXJVidp5_-6000000001160-2-tps-1024-1024-08b2bc305d.png" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01KjRuPD1UV7yhMNs2R_-6000000002522-2-tps-1417-1889-b7398944f6.png"],
  },
  {
    id: "5328002",
    title: "童趣暖光居家",
    prompt: "让3-9个月婴儿模特穿上图1的黄色长袖连体衣，带有热气球和云朵图案，戴上图2的橙色太阳月亮图案帽子，穿上图3的浅色草莓图案长袜，抱着图4的棕色小熊玩偶。动作：躺着抱玩偶或与玩偶互动；场景：儿童房，自然光和暖色道具，温馨商拍。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Z7SIPS26ehepqGkW7_-6000000007687-2-tps-2304-3072-3d104a0da3.png",
    assets: [
      { id: "5328002-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN019KRRk31ZG52ntGD5D_-6000000003166-2-tps-3072-2886-b89a25aecd.png" },
      { id: "5328002-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01cItZTL1SRns6kQsa4_-6000000002244-2-tps-1024-1024-465da9445a.png" },
      { id: "5328002-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01yBUyIl1YgoXtkQLd1_-6000000003089-2-tps-1024-1024-168c2a09f5.png" },
      { id: "5328002-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01TOX3UE1fw75UELDec_-6000000004070-2-tps-1056-992-9797652ad8.png" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Z7SIPS26ehepqGkW7_-6000000007687-2-tps-2304-3072-3d104a0da3.png"],
  },
  {
    id: "5328001",
    title: "圣诞针织日常",
    prompt: "让自然女性模特穿上图1的红色毛衣，带有白色几何图案，穿上图2的棕色高腰短裙，脚穿图3的棕色毛绒靴子，穿上图4的白色条纹针织长袜，手持图5的毛绒材质手提包。姿势：站立，双手自然垂于身体两侧，微微侧头看向镜头。背景：简约风格的室内背景，有木质地板和柔和灯光。",
    outputCount: 4,
    coverUrl: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01SQBId01qLR90YQwVB_-6000000005479-2-tps-864-1184-b2ab0d081b.png",
    assets: [
      { id: "5328001-1", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01ZKKGEJ1KAqHIEZO2K_-6000000001124-2-tps-1000-1000-eea05d66ca.png" },
      { id: "5328001-2", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01O33MoS1nXOdgvHKDI_-6000000005099-2-tps-864-864-4290f08e14.png" },
      { id: "5328001-3", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01zjx9my1tQQIuduPLf_-6000000005896-2-tps-864-864-c4140d33ca.png" },
      { id: "5328001-4", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN013GWPBV1spKDqsGQoJ_-6000000005815-2-tps-1024-1024-67f2934d74.png" },
      { id: "5328001-5", role: "outfit", url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01URoV9V1yl6GOMimAt_-6000000006618-2-tps-864-864-fc6894b6bd.png" },
    ],
    resultUrls: ["https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01SQBId01qLR90YQwVB_-6000000005479-2-tps-864-1184-b2ab0d081b.png"],
  },
] satisfies OutfitFusionTemplate[]).map((template) => ({
  ...template,
  prompt: applyOutfitFusionVisibleFaceText(template.prompt),
}));

export function getOutfitFusionAssetLabel(asset: Pick<OutfitFusionAsset, "role">, index: number) {
  return `图${index + 1}`;
}

export function getOutfitFusionRoleLabel(role: OutfitFusionAssetRole) {
  if (role === "reference") return "参考图";
  if (role === "model") return "模特";
  return "搭配图";
}

export function getOutfitFusionPreviewRole(role: OutfitFusionAssetRole): ImagePreviewReferenceRole {
  if (role === "reference") return "reference";
  if (role === "model") return "model";
  return "clothing";
}

export function outfitFusionReferencesFromAssets(assets: OutfitFusionAsset[]): ImagePreviewReference[] {
  return assets.map((asset, index) => ({
    url: asset.url,
    label: getOutfitFusionAssetLabel(asset, index),
    role: getOutfitFusionPreviewRole(asset.role),
  }));
}

export function resolveOutfitFusionSmartAspectImage(input: {
  assets?: Array<{ role?: string | null; url?: string | null }> | null;
  referenceUrls?: string[] | null;
  resolvedReferenceUrls?: string[] | null;
}) {
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const referenceUrls = normalizeOutfitFusionAspectSourceUrls(input.referenceUrls);
  const resolvedReferenceUrls = normalizeOutfitFusionAspectSourceUrls(input.resolvedReferenceUrls);
  const referenceAssetIndex = assets.findIndex((asset) => asset.role === "reference" && cleanOutfitFusionAspectSourceUrl(asset.url));

  if (referenceAssetIndex < 0) return undefined;

  const referenceAssetUrl = cleanOutfitFusionAspectSourceUrl(assets[referenceAssetIndex]?.url);
  const matchedIndex = referenceAssetUrl ? referenceUrls.findIndex((url) => url === referenceAssetUrl) : -1;
  const sourceIndex = matchedIndex >= 0 ? matchedIndex : referenceAssetIndex;

  return (
    resolvedReferenceUrls[sourceIndex] ||
    referenceUrls[sourceIndex] ||
    referenceAssetUrl
  );
}

export function clampOutfitFusionCount(value: unknown) {
  const numeric = Number(value);
  const count = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_OUTFIT_FUSION_CONFIG.genCount;
  return Math.min(Math.max(count, 1), 4);
}

function normalizeOutfitFusionAspectSourceUrls(value?: string[] | null) {
  return Array.isArray(value)
    ? value.map(cleanOutfitFusionAspectSourceUrl).filter((url): url is string => Boolean(url))
    : [];
}

function cleanOutfitFusionAspectSourceUrl(value?: string | null) {
  const url = typeof value === "string" ? value.trim() : "";
  return url || undefined;
}

export function buildOutfitFusionPrompt(input: {
  templatePrompt?: string;
  assets: OutfitFusionAsset[];
  customPrompt?: string;
  config: OutfitFusionConfig;
}) {
  const visiblePrompt = (input.templatePrompt?.trim() || input.customPrompt?.trim() || "").replace(/\s+/g, " ");
  const hiddenFaceConstraints = buildOutfitFusionHiddenFaceConstraints({
    assets: input.assets,
    visiblePrompt,
  });
  return [visiblePrompt, hiddenFaceConstraints].filter(Boolean).join(" ");
}

export function buildOutfitFusionComposerText(template: OutfitFusionTemplate) {
  return template.prompt;
}

export function getOutfitFusionDisplayPrompt(prompt?: string | null, fallback = "") {
  const raw = typeof prompt === "string" ? prompt.trim() : "";
  if (!raw) return fallback;

  const coreMatch = raw.match(/核心任务[:：]\s*([\s\S]*?)(?=\s*(?:固定生成规则|图片关系|素材使用规则|商品保真|优先级|画面质量|负面约束|补充要求)[:：]|$)/);
  const source = coreMatch?.[1]?.trim() || raw;
  const cleaned = source
    .replace(/^请生成一张完整的单人商业摄影穿搭照片[，,、\s]*(?:输出比例[^；;。]*[；;。]\s*)?/u, "")
    .replace(/^核心任务[:：]\s*/u, "")
    .split(/(?:固定生成规则|图片关系|素材使用规则|商品保真|优先级|画面质量|负面约束|补充要求|生成要求|输出要求)[:：]/u)[0]
    .trim();

  return cleaned || fallback || raw.slice(0, 800);
}

export function normalizeOutfitFusionAssistantPrompt(prompt?: string | null, fallback = "") {
  const raw = typeof prompt === "string" ? prompt.trim() : "";
  if (!raw) return fallback;

  const direct = extractOutfitFusionUserSentence(raw);
  if (direct) return applyOutfitFusionVisibleFaceText(direct).slice(0, 800);

  const displayPrompt = getOutfitFusionDisplayPrompt(raw, "");
  const displayDirect = extractOutfitFusionUserSentence(displayPrompt);
  if (displayDirect) return applyOutfitFusionVisibleFaceText(displayDirect).slice(0, 800);

  const blockedLinePattern = /^(?:搭配融图生成任务|搭配配图生成任务|图片角色锁定|图片角色|生成要求|输出要求|负面约束|任务|图像角色)\s*[:：]?$/;
  const blockedContentPattern = /^(?:图\d+对应|参考图\d+\s*[:：]|搭配图\d+\s*[:：]|模特图?\d+\s*[:：]|输出比例|清晰度|模型|生成\s*\d+\s*张|只输出|不要解释|不要\s*Markdown|画面真实自然|photorealistic)/i;
  const cleaned = raw
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-*•\d.、\s]+/, ""))
    .filter((line) => line && !blockedLinePattern.test(line) && !blockedContentPattern.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/(?:固定生成规则|图片关系|素材使用规则|商品保真|优先级|画面质量|负面约束|生成要求|输出要求)[:：][\s\S]*$/u, "")
    .replace(/(?:拼图|四宫格|2x2\s*网格|分屏|contact sheet|候选图|多张图|合集)[，,。；;\s]*/gi, "")
    .trim();

  return applyOutfitFusionVisibleFaceText(extractOutfitFusionUserSentence(cleaned) || cleaned || fallback).slice(0, 800);
}

function extractOutfitFusionUserSentence(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const candidates: Array<{ text: string; index: number; score: number }> = [];
  const pattern = /让(?:图\d+(?:的)?(?:人物|模特)|【参考图\d+】的模特|模特|自然[^，。；;]*模特|\d+[-~至]?\d*个月婴儿模特|\d+岁[^，。；;]*模特)[^。！？]*(?:[。！？]|$)/g;

  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const text = (match[0] || "").trim();
    if (!isOutfitFusionUserSentence(text)) continue;

    const prefix = normalized.slice(Math.max(0, index - 28), index);
    const isFormatExample = /(?:句式|示例|例如|输出必须采用)/.test(prefix);
    const isExistingUserPrompt = /用户已有要求[:：]\s*$/.test(prefix);
    candidates.push({
      text,
      index,
      score: (isExistingUserPrompt ? 20 : 0) - (isFormatExample ? 12 : 0),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.text || "";
}

function isOutfitFusionUserSentence(value: string) {
  if (!value) return false;
  if (!/(?:图\d+|【(?:搭配图|模特图)\d+】)/.test(value)) return false;
  if (/图[XYZMNY]/i.test(value)) return false;
  if (/【(?:参考图|搭配图|模特图)X】|【(?:参考图|搭配图|模特图)Y】|【(?:参考图|搭配图|模特图)Z】/.test(value)) return false;
  if (/(?:固定生成规则|素材使用规则|负面约束|生成张数|模型名|清晰度|分辨率|输出比例|Markdown|photorealistic|commercial photography|真实自然商业摄影质感)/i.test(value)) return false;
  return true;
}

export function buildOutfitFusionDemoResults(template: OutfitFusionTemplate | null, count: number) {
  const fallback = OUTFIT_FUSION_TEMPLATES[0];
  const source = template || fallback;
  const urls = source.resultUrls.length ? source.resultUrls : [source.coverUrl];
  return Array.from({ length: clampOutfitFusionCount(count) }, (_, index) => urls[index % urls.length]);
}
