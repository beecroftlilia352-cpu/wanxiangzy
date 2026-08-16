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

export type OutfitFusionRuntimeImageMapItem = {
  originalImageNumber: number;
  runtimeImageNumber: number;
  role: OutfitFusionAssetRole;
  url: string;
};

export type OutfitFusionRuntimePlan = {
  assets: OutfitFusionAsset[];
  referenceUrls: string[];
  clothingUrls: string[];
  modelFaceUrl: string | null;
  referenceUrl: string | null;
  prompt: string;
  imageNumberMap: OutfitFusionRuntimeImageMapItem[];
};

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
  const outfitRefs = input.assets
    .map((asset, index) => asset.role === "outfit" ? getOutfitFusionAssetLabel(asset, index) : "")
    .filter(Boolean);
  const outfitText = joinOutfitFusionRefs(outfitRefs);
  const outfitVisualRule = buildOutfitFusionVisualProductRule(outfitRefs);
  const referenceText = referenceRef
    ? `${referenceRef}只提供身体、姿态、构图、背景光影、身体比例/头身比、头部位置/大小、颈肩衔接、表情方向、肤色明暗和妆容；如果${referenceRef}中有人脸，不得保留其原脸身份、脸型、眼鼻嘴或可识别特征。`
    : "如果画面基础图里有人脸，不得保留其原脸身份、脸型、眼鼻嘴或可识别特征。";
  const outfitRoleText = outfitText
    ? `${outfitText}只作为服装、鞋包、帽子、围巾或配饰商品来源，不是人物、姿势、脸部身份、肤色、光照、背景或场景参考；只提取商品本体的品类、款式、廓形、颜色、图案、Logo/文字、材质、面料纹理、正确身体部位和穿戴层级。`
    : "所有搭配商品图只作为商品来源，不是人物、姿势、脸部身份、肤色、光照、背景或场景参考。";
  const expressionCarrier = referenceRef || "目标画面";
  const visibleSkinCarrier = referenceRef ? `${referenceRef}可见的颈、胸、手臂、手` : "最终人物可见的颈、胸、手臂、手";
  const roleLockText = [
    referenceRef
      ? `图像角色锁定：${referenceRef}=target/base canvas 目标底图，只控制最终画面的身体、姿态、构图、背景、镜头、光影、身体比例/头身比、头部位置/大小、表情方向和肤色明暗。`
      : "图像角色锁定：本次没有上传 target/base canvas 目标底图；需要根据用户关系描述生成新的单人商业穿搭图，不得把任一商品图当成人物底图。",
    outfitText ? `${outfitText}=商品来源，只控制对应服装、鞋包和配饰本体。` : "",
    `${modelRef}=model face identity 模特脸图，只控制最终人物脸部身份、脸型、五官、骨相、可识别相似度、发色和发型。`,
  ].filter(Boolean).join(" ");
  const taskLockText = referenceRef
    ? `核心编辑任务：以${referenceRef}作为最终画面的唯一底图/构图基础，把${outfitText || "商品图"}中的商品穿戴到${referenceRef}人物对应位置，并把最终人物脸部身份替换为${modelRef}。`
    : `核心生成任务：生成一张新的单人商业穿搭照片，把${outfitText || "商品图"}中的商品穿戴到人物对应位置，并把最终人物脸部身份设定为${modelRef}；不得从商品图复制人物、姿势、背景或脸。`;

  return [
    roleLockText,
    taskLockText,
    `脸部身份规则：${modelRef}是最终脸部身份唯一来源。本任务是身份替换任务，最终脸必须一眼像${modelRef}本人；如果最终脸仍像参考图原人物、随机陌生人、通用网红脸或两张脸平均融合，即使服装正确也判定失败。`,
    referenceText,
    `${modelRef}只控制最终脸部身份、脸型轮廓、五官结构、眼形眼距、眉形、鼻梁/鼻尖/鼻翼、嘴形、五官比例、骨相、可识别相似度、发色和发型；不提供服装、身体、姿势、背景或光照。`,
    `必须把${referenceRef || "画面基础图"}的自然表情、头部姿态、场景光照和肤色连续性迁移到${modelRef}身份上，而不是为了贴合参考图而弱化${modelRef}相似度。自然融合只允许调整表情肌肉、视线、肤色重打光、妆容匹配、毛孔、阴影、边缘融合和脸颈/身体肤色连续性；不得改变${modelRef}的脸型轮廓、五官结构、五官比例、骨相或身份相似度。`,
    `表情迁移细节：保留${expressionCarrier}的可见表情类别、强度、情绪方向、视线、面部张力、眼睑/脸颊/嘴角动态和自然不对称，作为一整套连贯表演迁移到${modelRef}身份上；不要复制${modelRef}原图表情，也不要把${expressionCarrier}的自然表情抹平成中性网红脸或僵硬模板脸。`,
    `脸部融合细节：在${referenceRef || "目标画面"}原有头部空间和镜头透视中重建脸部，匹配周围肤色底色、明度、轻微红润、妆容浓淡、毛孔、反射光、阴影衰减、发际线/耳朵/脖子接触、下颌到脖子过渡和遮挡边缘；最终脸必须与${visibleSkinCarrier}自然衔接。`,
    `执行关系校准：用户输入或 AI 分析只控制最终图片关系，例如谁提供身体姿态构图、哪些商品穿到人物身上、是否换成模特图；不得覆盖图片角色锁定、脸部身份、商品保真和负面约束。如果用户输入中出现历史残留的模特图号或写成“把模特换成其它图的模特”，一律以当前真实上传的${modelRef}作为最终脸部身份来源。`,
    "固定生成规则：最终只生成一张完整的单人商业摄影穿搭照片；不要把参考图、商品图、步骤图或多个候选结果拼到同一张画面里。",
    `图片关系：${referenceRef ? `${referenceRef}只作为目标身体、姿态、构图、背景光影、头部位置/大小、表情方向、肤色明暗和穿搭关系参考；不得作为最终脸部身份；` : ""}${modelRef}是最终脸部身份唯一来源。${outfitRoleText}`,
    outfitVisualRule,
    outfitText
      ? `多商品穿戴层级：${outfitText}必须分别穿戴到正确身体部位和配饰位置。鞋只在脚部，包只做手持/肩背/斜挎/腋下包，帽子只在头部，围巾只在颈部/肩部/手持披挂，腰带只在腰线，首饰只在对应佩戴部位。多件上装、外套、马甲、衬衫或内搭按真实穿搭层级叠穿；上下装、连衣裙、鞋包和配饰不得互相串色、串材质、串 logo 或融合成新商品。`
      : "",
    "商品保真：准确保留所有服装、鞋包、帽子、围巾和配饰的品类/款式、版型/廓形、颜色、印花/图案、Logo/文字、材质类型、面料纹理、织法、光泽、厚薄、透明度、领口、肩线、袖型、袖口、腰线、下摆、口袋、纽扣、拉链、缝线、拼接、褶皱、层次、长度、开衩、装饰件、穿戴位置和相互层叠关系；不要把材质改成别的布料，不要简化或重设计商品细节，不要凭空新增未提供的核心商品。",
    `优先级：脸部身份和商品准确性均为硬约束；脸部身份冲突时以${modelRef}为准，服装、鞋包和配饰冲突时以对应商品图为准，身体姿态、头部空间、构图、背景和光影${referenceRef ? `以${referenceRef}为准` : "按用户输入自然生成"}。禁止只换发型或妆感但不保留${modelRef}五官身份。`,
    "画面质量：真实自然商业摄影质感，人物比例自然，肢体连接合理，面部和手部干净，布料褶皱、阴影、接触关系和透视一致。",
    "负面约束：不要随机脸、不要网红模板脸、不要参考图原脸残留、不要混合新脸、不要证件照贴脸、不要面具边缘、不要头身比漂移、不要大头小身、不要头脸比例漂移、不要肤色断层、不要多余肢体、不要错误手指、不要变形脸、不要错穿层级、不要多件商品融合成一件新款、不要错色、不要丢失图案、不要硬贴图、不要塑料质感、不要水印、不要边框、不要海报文字、不要电商模板排版、不要拼图、四宫格、2x2 网格、分屏、contact sheet、before/after 对比图、商品陈列页或多张照片合集。",
  ].join(" ");
}

function buildOutfitFusionVisualProductRule(outfitRefs: string[]) {
  if (!outfitRefs.length) return "";

  const outfitText = joinOutfitFusionRefs(outfitRefs);
  const scopeRule = outfitRefs.length === 1
    ? `单商品穿戴范围：先判断${outfitText}是上衣、下装、外套、连衣裙、连体衣、套装、大衣、鞋包配饰还是局部细节。若是上衣，只替换上半身冲突服装；若是下装，只替换下半身冲突服装；若是连衣裙、连体衣、套装、大衣或完整穿搭，才替换它自然覆盖的冲突区域；若只是鞋、包、帽、围巾、腰带或首饰，只放在对应佩戴/持拿位置。`
    : `多商品视觉分配：逐张判断${outfitText}各自是上衣、下装、外套、连衣裙、连体衣、套装、鞋、包、帽、围巾、腰带、首饰、玩偶还是局部补充，并按真实身体区域和穿戴动作分配；不得因为某张图是局部、背面或侧面而把它扩大成完整全身穿搭。`;

  return [
    "商品视觉读取：先根据每张商品图真实画面判断品类、自然覆盖区域、穿戴方式、适用人群线索、材质、颜色、结构、图案和可见细节；适用人群只从商品本身的尺码、版型、款式和安全穿着线索判断，证据不足按中性商品处理，并且只用于商品尺码、版型、身体比例和安全穿着语境；不要把商品图当成人物、脸、身体、姿势、背景或光线来源。",
    scopeRule,
    "局部细节/多角度补充：如果某张商品图只是面料、领口、袖口、口袋、纽扣、拉链、Logo、背面、侧面或半裁切局部，只能补充与主商品颜色、材质、结构明显对应的局部细节；无法判断对应关系时直接忽略，不得作为独立新衣服、新配饰、人物、姿势、脸、背景、光线或跨商品纹理来源。",
  ].join(" ");
}

function joinOutfitFusionRefs(refs: string[]) {
  return refs.join("、");
}

export const OUTFIT_FUSION_TEMPLATES: OutfitFusionTemplate[] = ([
  {
    id: "7839001",
    title: "轻熟通勤多件套",
    prompt: "让图1的人物姿态、构图和场景氛围作为画面基础，头戴图2的棕色平顶帽，身穿图3的蓝色无袖上衣，搭配图4的白色半身裙，手持图5的棕色手提包，把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN019Cu8zE1EcsrHtNUWm_-6000000000373-2-tps-3520-4693-acc7264244.png",
    assets: [
      { id: "7839001-1", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01yslKdz1CnIdSzUGA3_-6000000000125-0-tps-1104-1472-59c00277f7.jpg" },
      { id: "7839001-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01RYn4xW1yVzDjJD7HN_-6000000006585-0-tps-1024-1032-5131d7ff2f.jpg" },
      { id: "7839001-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01v16hIZ1Jx6QIkgS4N_-6000000001094-0-tps-1024-1016-9c5561c21c.jpg" },
      { id: "7839001-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01BbZtq51kHsOimn9ya_-6000000004659-0-tps-1024-1032-b7494a9cb4.jpg" },
      { id: "7839001-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN014PHmy51LeRWCiDuV5_-6000000001324-0-tps-1024-1016-ef74e16b9e.jpg" },
      { id: "7839001-6", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01k7OCfB1qCje8IISOI_-6000000005460-0-tps-1440-1891-fa9cbb847b.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN019Cu8zE1EcsrHtNUWm_-6000000000373-2-tps-3520-4693-acc7264244.png"],
  },
  {
    id: "7839002",
    title: "图书馆秋冬层次",
    prompt: "让图6的人物姿态、构图和场景氛围作为画面基础，身穿图1的灰色长裙，手持图2的黑色菱格纹手提包，脚穿图3的黑色漆皮尖头高跟鞋，外搭图4的深棕色毛呢外套并佩戴图4的绿色图案丝巾，内搭图5的浅蓝色长袖衬衫，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01ge3fYu1tqWuIDP9O1_-6000000005953-0-tps-3520-4693-a38b93a75e.jpg",
    assets: [
      { id: "7839002-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01NaOW3X20b8uXpb3Wk_-6000000006867-0-tps-1024-1019-4ef8af4e52.jpg" },
      { id: "7839002-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01jJtIAX1EeiRaa6et4_-6000000000377-0-tps-1024-1024-eeb5433ee9.jpg" },
      { id: "7839002-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01vAvtR71lD7uEdbGlI_-6000000004784-0-tps-1024-1038-30799d52e9.jpg" },
      { id: "7839002-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01jmhKa61fcsTpkmVzE_-6000000004028-0-tps-1024-1024-2bcadad7a4.jpg" },
      { id: "7839002-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Qt0DZY29RN0AiTaAk_-6000000008064-0-tps-1024-1029-cecb901c58.jpg" },
      { id: "7839002-6", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01pG0cpk1mjvtLMY9Gj_-6000000004991-0-tps-1104-1472-3378a5a817.jpg" },
      { id: "7839002-7", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01zug3D91jAial3v3lp_-6000000004508-0-tps-864-1184-eef13cd1b5.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01ge3fYu1tqWuIDP9O1_-6000000005953-0-tps-3520-4693-a38b93a75e.jpg"],
  },
  {
    id: "7839004",
    title: "度假浅灰套装",
    prompt: "让图8的人物姿态、构图和场景氛围作为画面基础，身穿图2的浅灰色吊带连衣裙，外搭图3的浅灰色花卉图案马甲，头戴图4的米色编织帽子，颈间系着或手持图5的浅蓝色菠萝图案围巾，脚穿图1的银色高跟凉鞋，手持图6的绿色菱格纹手提包，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01EFPiFR23sUlSb0vwj_-6000000007311-2-tps-3072-4096-c981504ed0.png",
    assets: [
      { id: "7839004-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01vIOISc1TKlQVtySR6_-6000000002364-0-tps-1016-1024-fae3a733f3.jpg" },
      { id: "7839004-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01RW9Y8v1OyXkRU2izV_-6000000001774-0-tps-1024-1032-7165a45081.jpg" },
      { id: "7839004-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01nF3mv22A4IfRGLCAs_-6000000008149-0-tps-1424-1424-3832b71892.jpg" },
      { id: "7839004-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01VemS1x1VnjiFwsCyo_-6000000002698-0-tps-1024-1025-dc3d71af42.jpg" },
      { id: "7839004-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN014VG9pO1dbNxTD9shd_-6000000003754-0-tps-1360-1360-bab3d944f5.jpg" },
      { id: "7839004-6", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01l5rKUo27tBpOiWRHV_-6000000007854-0-tps-1024-1024-c8a65c83d5.jpg" },
      { id: "7839004-7", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01U7Mt0t1PkAwH4k4IK_-6000000001878-2-tps-467-640-64ba5a703b.png" },
      { id: "7839004-8", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01qyGOO01Qj5cDwUINL_-6000000002011-0-tps-1104-1472-f1f0eb8444.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01EFPiFR23sUlSb0vwj_-6000000007311-2-tps-3072-4096-c981504ed0.png"],
  },
  {
    id: "7840002",
    title: "机能风深色套装",
    prompt: "让图6的人物姿态、构图和场景氛围作为画面基础，脚穿图1的黑色皮质鞋子，手持图2的黑色手提包，身穿图3的米色工装裤，内搭图4的黑色长袖衬衫，外搭图5的灰色羊羔绒领夹克，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01tAg6li1tP38uu9UPk_-6000000005893-2-tps-3520-4693-e77c4f1266.png",
    assets: [
      { id: "7840002-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01EtNGX01Sg0B1zMKSw_-6000000002275-0-tps-1024-1032-0b3c87c8ea.jpg" },
      { id: "7840002-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN012sAVDc1eOqjWj6exm_-6000000003862-0-tps-1016-1032-73affc7213.jpg" },
      { id: "7840002-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01Vvcisb24avBNpsGCo_-6000000007408-0-tps-1360-1360-0c9276868c.jpg" },
      { id: "7840002-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01SGgkeU1ZXU7dHbODf_-6000000003204-0-tps-1024-1029-d79b0e965c.jpg" },
      { id: "7840002-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01bkPWk01JsyrIAA2hJ_-6000000001085-0-tps-1024-1024-b01df5ab5c.jpg" },
      { id: "7840002-6", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01D4lHEU1PNH8Sokz44_-6000000001828-0-tps-1104-1472-92f99eeab1.jpg" },
      { id: "7840002-7", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01gyyKNQ1y0NtMi5kGN_-6000000006516-0-tps-467-640-4cdfab1e6a.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01tAg6li1tP38uu9UPk_-6000000005893-2-tps-3520-4693-e77c4f1266.png"],
  },
  {
    id: "7840003",
    title: "海岛运动混搭",
    prompt: "让图8的人物姿态、构图和场景氛围作为画面基础，头戴图1的白色运动帽，身穿图2的浅蓝色短袖T恤，佩戴图3的棕色方形太阳镜，身穿图4的紫色宽松裤子，脚穿图5的蓝色PUMA运动鞋，佩戴图6的浅灰色布质腰包，把模特换成图7的模特，保留图7模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01TzHP7m1eY0eeHY97a_-6000000003882-0-tps-3520-4693-d6f57c42d8.jpg",
    assets: [
      { id: "7840003-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01AUuZy51kzqQ6D2YuB_-6000000004755-0-tps-1016-1024-afb112e920.jpg" },
      { id: "7840003-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01A8RTWn1dVtCnqCQNx_-6000000003742-0-tps-1016-1024-f1f1985fe6.jpg" },
      { id: "7840003-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01Pi9nh51WTs9PGA9PZ_-6000000002790-2-tps-864-857-0e3ec0a331.png" },
      { id: "7840003-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN018n5WEU1Mhw9iynkJX_-6000000001467-0-tps-1360-1360-c750e7fecf.jpg" },
      { id: "7840003-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01sYqXOv1WdUT5RvROH_-6000000002811-0-tps-1024-1019-9fb189fd4c.jpg" },
      { id: "7840003-6", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01VpYZ5g1Qcg4QvVXYj_-6000000001997-0-tps-1024-1032-86b1f9ce13.jpg" },
      { id: "7840003-7", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01mV6tFe1aGpKfgp1Xr_-6000000003303-2-tps-467-640-2d267e33da.png" },
      { id: "7840003-8", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01yc6PPM1nrY5raA73L_-6000000005143-0-tps-1104-1472-5ad9773340.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01TzHP7m1eY0eeHY97a_-6000000003882-0-tps-3520-4693-d6f57c42d8.jpg"],
  },
  {
    id: "7840004",
    title: "法式街景黑白红",
    prompt: "让自然商业女模特身穿图1的白色花卉图案衬衫，搭配图2的黑色短裤，脚穿图3的黑色蝴蝶结高跟靴子，外搭图4的黑色风衣外套，手持图5的红色皮质手提包并搭配图5的花纹丝巾，把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型。姿势：站立，身体微微侧转，头部自然抬起看向镜头，双手自然垂放，肩部放松，姿态优雅自信。背景：具有岁月感的米色石灰岩建筑立面，远处虚化的欧式铸铁栏杆或咖啡馆遮阳篷，营造沉稳的异域度假氛围。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN012G0jg41aiJ62eo9t4_-4611686018427383075-0-aigc_biz_alg-a7760ffd5c.jpg",
    assets: [
      { id: "7840004-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01vp2TwC1QlNb0WgFo6_-6000000002016-0-tps-1360-1360-411122ab9f.jpg" },
      { id: "7840004-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01ZM4bXc1pA9njp08v7_-6000000005319-0-tps-1360-1360-e0f95e2d39.jpg" },
      { id: "7840004-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01NOG1Gc1imtzpWQshG_-6000000004456-0-tps-1024-1024-1d697c9d34.jpg" },
      { id: "7840004-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01m5Uvkg1bKmMlA9abu_-6000000003447-2-tps-1024-1024-9b2c9c0171.png" },
      { id: "7840004-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01LnWUaw1p3kFxAIKgg_-6000000005305-0-tps-1360-1360-bd30c81d0e.jpg" },
      { id: "7840004-6", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN014C5mKw1pfl6dvGtea_-4611686018427385100-0-aigc_biz_alg-df6d322d04.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN012G0jg41aiJ62eo9t4_-4611686018427383075-0-aigc_biz_alg-a7760ffd5c.jpg"],
  },
  {
    id: "7842001",
    title: "雪线户外多层叠穿",
    prompt: "让图8的人物姿态、构图和场景氛围作为画面基础，身穿图1的黑色牛仔夹克，手持图2的黑色手提包，颈部佩戴图3的黑色针织围巾，脚穿图4的棕色系带靴子，叠穿图5的灰色夹克，头戴图6的米色蓝红雪花图案针织帽，身穿图7的黑色宽腿牛仔裤，把模特换成图9的模特，保留图9模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN019gcRJS1DwI1Zg3Mxz_-6000000000280-2-tps-3520-4693-17a8a3d423.png",
    assets: [
      { id: "7842001-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01MwQQla1U5TpFJ8OHb_-6000000002466-0-tps-1024-1019-b8fff2d85d.jpg" },
      { id: "7842001-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01cE89Q91kA5fGvdiNt_-6000000004642-0-tps-1024-1024-9aa99d942c.jpg" },
      { id: "7842001-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01rjWoab1PV3ruqvuAL_-6000000001845-0-tps-1024-1016-014dbae157.jpg" },
      { id: "7842001-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01p6hd2N23G1Ujevv94_-6000000007227-0-tps-1024-1024-69a3272bf2.jpg" },
      { id: "7842001-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN019alDDb1IuWZtpzxWX_-6000000000953-0-tps-1024-1016-63bbf5c5e2.jpg" },
      { id: "7842001-6", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01FDLFcn1aoidpWn91y_-6000000003377-0-tps-1024-1020-72277fe68d.jpg" },
      { id: "7842001-7", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01LU4YbR1ksW5CJOTHb_-6000000004739-0-tps-1024-1032-7d3ff6ea42.jpg" },
      { id: "7842001-8", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01KwFovd1FkxSSRiITl_-6000000000526-0-tps-1104-1472-aa70fb5c47.jpg" },
      { id: "7842001-9", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN013tRneq1aVwOwvJOno_-6000000003336-2-tps-467-640-751d1556b6.png" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN019gcRJS1DwI1Zg3Mxz_-6000000000280-2-tps-3520-4693-17a8a3d423.png"],
  },
  {
    id: "7842002",
    title: "庭院男装轻机能",
    prompt: "让图5的人物姿态、构图和场景氛围作为画面基础，脚穿图1的白色运动鞋，手持图2的黑色手提包，身穿图3的黑色夹克，搭配图4的灰色工装短裤和棕色皮质腰带，把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01E50D3s1GlhidLhC4L_-6000000000663-0-tps-2792-3720-5c402516f7.jpg",
    assets: [
      { id: "7842002-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01OvOmnC1TtZWn1npiX_-6000000002440-0-tps-1024-1032-527035c581.jpg" },
      { id: "7842002-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01cE89Q91kA5fGvdiNt_-6000000004642-0-tps-1024-1024-9aa99d942c.jpg" },
      { id: "7842002-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN019pFjtt1UkF4eVjUOS_-6000000002555-0-tps-1024-1016-ceca40957e.jpg" },
      { id: "7842002-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01b1FH5n1FuZm7jcB4u_-6000000000547-0-tps-1024-1032-8d82f8dafa.jpg" },
      { id: "7842002-5", role: "reference", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01DWBdbK27WI1aA493R_-6000000007804-0-tps-908-1210-b42d8c2de1.jpg" },
      { id: "7842002-6", role: "model", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01te0mUE1u71AE0Qcng_-6000000005989-0-tps-2314-3086-effca89d7b.jpg" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01E50D3s1GlhidLhC4L_-6000000000663-0-tps-2792-3720-5c402516f7.jpg"],
  },
  {
    id: "5348001",
    title: "雪山儿童户外",
    prompt: "让8岁欧美男童模特穿上图1的黄色格纹羽绒服，穿上图2的棕色宽松裤子，脚穿图3的红色和黄色运动鞋，戴上图4的彩色图案针织帽，背着图5的绿色单肩包，带有棕色肩带和扣件。动作：正面站立，一手插兜；场景：雪山脚下或高原草甸，自然光，突出防风保暖与版型。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01KjRuPD1UV7yhMNs2R_-6000000002522-2-tps-1417-1889-b7398944f6.png",
    assets: [
      { id: "5348001-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01QRMlcl1ZQ9l2wlVYd_-6000000003188-2-tps-1000-1000-51374740d6.png" },
      { id: "5348001-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01eCkC4x1pVgOBVYXNW_-6000000005366-2-tps-1000-1000-5f051eed65.png" },
      { id: "5348001-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01S6qSgq1tBld13Of5q_-6000000005864-2-tps-1024-1024-f0a4d772cf.png" },
      { id: "5348001-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Taz9vJ1yRrd2UegbZ_-6000000006576-2-tps-992-992-b91b624f26.png" },
      { id: "5348001-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01grcKDv1KRKXJVidp5_-6000000001160-2-tps-1024-1024-08b2bc305d.png" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01KjRuPD1UV7yhMNs2R_-6000000002522-2-tps-1417-1889-b7398944f6.png"],
  },
  {
    id: "5328002",
    title: "童趣暖光居家",
    prompt: "让3-9个月婴儿模特穿上图1的黄色长袖连体衣，带有热气球和云朵图案，戴上图2的橙色太阳月亮图案帽子，穿上图3的浅色草莓图案长袜，抱着图4的棕色小熊玩偶。动作：躺着抱玩偶或与玩偶互动；场景：儿童房，自然光和暖色道具，温馨商拍。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Z7SIPS26ehepqGkW7_-6000000007687-2-tps-2304-3072-3d104a0da3.png",
    assets: [
      { id: "5328002-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN019KRRk31ZG52ntGD5D_-6000000003166-2-tps-3072-2886-b89a25aecd.png" },
      { id: "5328002-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01cItZTL1SRns6kQsa4_-6000000002244-2-tps-1024-1024-465da9445a.png" },
      { id: "5328002-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01yBUyIl1YgoXtkQLd1_-6000000003089-2-tps-1024-1024-168c2a09f5.png" },
      { id: "5328002-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01TOX3UE1fw75UELDec_-6000000004070-2-tps-1056-992-9797652ad8.png" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01Z7SIPS26ehepqGkW7_-6000000007687-2-tps-2304-3072-3d104a0da3.png"],
  },
  {
    id: "5328001",
    title: "圣诞针织日常",
    prompt: "让自然女性模特穿上图1的红色毛衣，带有白色几何图案，穿上图2的棕色高腰短裙，脚穿图3的棕色毛绒靴子，穿上图4的白色条纹针织长袜，手持图5的毛绒材质手提包。姿势：站立，双手自然垂于身体两侧，微微侧头看向镜头。背景：简约风格的室内背景，有木质地板和柔和灯光。",
    outputCount: 4,
    coverUrl: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01SQBId01qLR90YQwVB_-6000000005479-2-tps-864-1184-b2ab0d081b.png",
    assets: [
      { id: "5328001-1", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i4/O1CN01ZKKGEJ1KAqHIEZO2K_-6000000001124-2-tps-1000-1000-eea05d66ca.png" },
      { id: "5328001-2", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01O33MoS1nXOdgvHKDI_-6000000005099-2-tps-864-864-4290f08e14.png" },
      { id: "5328001-3", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i3/O1CN01zjx9my1tQQIuduPLf_-6000000005896-2-tps-864-864-c4140d33ca.png" },
      { id: "5328001-4", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN013GWPBV1spKDqsGQoJ_-6000000005815-2-tps-1024-1024-67f2934d74.png" },
      { id: "5328001-5", role: "outfit", url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i2/O1CN01URoV9V1yl6GOMimAt_-6000000006618-2-tps-864-864-fc6894b6bd.png" },
    ],
    resultUrls: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/remote/img.alicdn.com/imgextra/i1/O1CN01SQBId01qLR90YQwVB_-6000000005479-2-tps-864-1184-b2ab0d081b.png"],
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

export function buildOutfitFusionRuntimePlan(input: {
  assets: OutfitFusionAsset[];
  prompt?: string | null;
  userPrompt?: string | null;
  config: OutfitFusionConfig;
}): OutfitFusionRuntimePlan {
  const runtime = buildOutfitFusionRuntimeImageOrder(input.assets);
  const visiblePrompt = getOutfitFusionDisplayPrompt(input.userPrompt || input.prompt, input.userPrompt || input.prompt || "");
  const remappedVisiblePrompt = remapOutfitFusionPromptImageNumbers(visiblePrompt, runtime.imageNumberMap);
  const prompt = buildOutfitFusionPrompt({
    templatePrompt: remappedVisiblePrompt,
    assets: runtime.assets,
    config: input.config,
  });
  const referenceAsset = runtime.assets.find((asset) => asset.role === "reference") || null;
  const modelAsset = runtime.assets.find((asset) => asset.role === "model") || null;
  return {
    assets: runtime.assets,
    referenceUrls: runtime.assets.map((asset) => asset.url),
    clothingUrls: runtime.assets.filter((asset) => asset.role === "outfit").map((asset) => asset.url),
    modelFaceUrl: modelAsset?.url || null,
    referenceUrl: referenceAsset?.url || null,
    prompt,
    imageNumberMap: runtime.imageNumberMap,
  };
}

export function buildOutfitFusionRuntimeImageOrder(assets: OutfitFusionAsset[]) {
  const entries = assets.map((asset, originalIndex) => ({ asset, originalIndex }));
  const orderedEntries = [
    ...entries.filter((entry) => entry.asset.role === "reference"),
    ...entries.filter((entry) => entry.asset.role === "outfit"),
    ...entries.filter((entry) => entry.asset.role === "model"),
  ];
  const runtimeAssets = orderedEntries.map((entry) => ({ ...entry.asset }));
  return {
    assets: runtimeAssets,
    imageNumberMap: orderedEntries.map((entry, runtimeIndex) => ({
      originalImageNumber: entry.originalIndex + 1,
      runtimeImageNumber: runtimeIndex + 1,
      role: entry.asset.role,
      url: entry.asset.url,
    })),
  };
}

export function remapOutfitFusionPromptImageNumbers(prompt: string, imageNumberMap: OutfitFusionRuntimeImageMapItem[]) {
  const trimmed = prompt.trim();
  if (!trimmed || imageNumberMap.length === 0) return trimmed;
  const numberMap = new Map(imageNumberMap.map((item) => [item.originalImageNumber, item.runtimeImageNumber]));
  return trimmed.replace(/图\s*([1-9]\d*)/g, (match, rawNumber: string) => {
    const nextNumber = numberMap.get(Number(rawNumber));
    return nextNumber ? `图${nextNumber}` : match;
  });
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
  if (!hiddenFaceConstraints) return visiblePrompt;
  return [hiddenFaceConstraints, visiblePrompt ? `核心任务：${visiblePrompt}` : ""].filter(Boolean).join(" ");
}

export function buildOutfitFusionComposerText(template: OutfitFusionTemplate) {
  return template.prompt;
}

export function buildOutfitFusionVisionPromptRequest(inputAssets: OutfitFusionAsset[], seedPrompt: string) {
  const roleLines = inputAssets.map((asset, index) => {
    if (asset.role === "reference") {
      return `图${index + 1}只提供人物身体、姿态、头部位置、构图、场景氛围、光影和背景；可以写“让图${index + 1}人物穿上/戴上/拿着其它图商品”。`;
    }
    if (asset.role === "model") {
      return `图${index + 1}只提供最终模特脸部身份：面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型；不参考身体、姿势、服装、背景或光线。`;
    }
    return `图${index + 1}只提供商品本体，先视觉识别它是主服装、鞋包配饰、连体/套装，还是局部细节、背面、侧面或面料补充；识别商品类别、目标人群线索、颜色、材质、版型、长度、图案、Logo、鞋包配饰和正确穿戴位置。目标人群只能从商品尺码、版型和款式判断，例如男装、女装、中性、成人、青少年、童装或婴幼儿；不要根据商品图里的模特脸、身体、姿势、背景或拍摄风格判断，证据不足就不写。主商品写进可见提示词，局部细节只补充对应主商品，无法判断归属则忽略。`;
  });

  return [
    "这是搭配融图的 AI 帮写任务，请调用视觉理解能力分析所有输入图。",
    "只输出一段可直接放进输入框并直接执行的中文提示词，不要分段，不要标题，不要 Markdown，不要解释。",
    "输出必须是用户输入框可见的一句话：让图X的人物姿态、构图和场景氛围作为画面基础，身穿图Y商品，手持图Z包，脚穿图A鞋子，外搭图B商品并佩戴图B配饰，内搭图C商品，把模特换成图M的模特，保留图M模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。X/Y/Z/A/B/C/M 必须替换成真实输入顺序编号，不要照抄格式示例。",
    "必须只使用图1、图2、图3这类真实输入顺序编号；不要使用参考图、搭配图、模特图加编号的角色别名。",
    "“让图X穿图Y/戴图Y/拿图Y”表示把图Y商品穿到或放到图X人物对应位置，不表示图X原本已有该穿搭；参考图只控制人物姿态、构图、场景氛围和光影。",
    "每个商品都写清楚穿着/外搭/戴着/拿着/背着/脚穿等动作，以及品类、颜色、材质、版型/长度、图案或 logo 等关键识别点。",
    "如果商品本身明显是男装、童装、青少年或婴幼儿款，只把这个判断自然融入人物/尺码/穿着语境；如果已有参考图或模特图，以用户上传角色为准，不要把商品图中的人物身份、姿势、身体、背景或光线带入最终图。",
    "单件商品不要默认当成完整全身套装：上衣只写上半身穿着，下装只写下半身穿着，鞋包帽围巾首饰只写对应位置；只有连衣裙、连体衣、套装、大衣或确实完整的一套穿搭，才写成覆盖多个身体区域。",
    "多件商品要按视觉识别分配到正确身体区域和层级：内搭、外套、马甲、衬衫、裤裙、鞋包、帽子、围巾和首饰不能串色、串材质、串 logo，也不能融合成一件新商品。",
    "如果输入里有局部细节图、背面图、侧面图或面料图，只把它作为对应主商品的局部细节补充；不要把细节图写成新的服装、人物、姿势、背景或光线来源。",
    `如果有模特脸图，只在用户可见提示词里写这段简洁换脸描述：${buildOutfitFusionVisibleFaceText("图M")}。不要把后台脸部完整约束、优先级、负面规则写进输入框。`,
    "不要写后台规则、脸部身份规则、图片关系、商品保真、优先级、负面约束、生成张数、模型名、比例、清晰度、视觉分析过程、识别置信度、概率、字段名、拼图、宫格、候选图、多张图或合集。",
    "图片输入关系如下，仅供你判断编号和商品，不要原样输出：",
    ...roleLines,
    seedPrompt ? "当前输入框内容已经是最终提示词；仅允许按上述自然关系句改写并修正识别错误，不要输出任何说明前缀。" : "",
    seedPrompt || "",
    "最终只返回这一句话本身。",
  ].filter(Boolean).join("\n");
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
  if (direct) return cleanOutfitFusionVisiblePrompt(direct);

  const displayPrompt = getOutfitFusionDisplayPrompt(raw, "");
  const displayDirect = extractOutfitFusionUserSentence(displayPrompt);
  if (displayDirect) return cleanOutfitFusionVisiblePrompt(displayDirect);

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

  return cleanOutfitFusionVisiblePrompt(extractOutfitFusionUserSentence(cleaned) || cleaned || fallback);
}

function cleanOutfitFusionVisiblePrompt(value: string) {
  return applyOutfitFusionVisibleFaceText(value)
    .replace(/\b(?:confidence|conf|conference|certainty)(?:\s*score)?\s*[:：=]?\s*\d+(?:\.\d+)?%?/gi, "")
    .replace(/(?:识别置信度|置信度|可信度|概率|评分)\s*[:：=]?\s*\d+(?:\.\d+)?%?/g, "")
    .replace(/(?:raw type|slot|upload mode|explicit slots|genderType|ageRange|garment_audience|age_group)\s*=\s*[^，,。；;\s]+/gi, "")
    .replace(/(?:视觉分析|识别结果|字段名)\s*[:：][^。！？；;]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/[，,；;]\s*([。！？]|$)/g, "$1")
    .trim()
    .slice(0, 800);
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
