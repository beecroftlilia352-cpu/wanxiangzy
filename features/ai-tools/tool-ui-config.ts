import type { FeatureKey } from "@/lib/navigation";
import {
  AI_TOOL_ROUTE_SLUGS,
  type AiToolRouteSlug,
  type AiToolSlug as AiToolOperation,
} from "@/lib/ai-tools/catalog";
import { STANDARD_MULTI_IMAGE_UPLOAD_LIMIT } from "@/lib/multi-image-upload-limits";

export const AI_TOOL_SLUGS = AI_TOOL_ROUTE_SLUGS;
export type AiToolSlug = AiToolRouteSlug;

export type AiToolModeOption = {
  value: string;
  label: string;
  description?: string;
};

export type AiToolUiConfig = {
  slug: AiToolSlug;
  operation: AiToolOperation;
  featureKey: FeatureKey;
  title: string;
  shortDescription: string;
  tooltip: string;
  uploadTitle: string;
  uploadHint: string;
  uploadRequirement: string;
  maxImages: number;
  capability: "segment" | "upscale" | "outpaint" | "inpaint" | "resize";
  providerLabel: string;
  modeTitle?: string;
  modeDescription?: string;
  modeOptions?: readonly AiToolModeOption[];
  requiresMask?: boolean;
  requiresReference?: boolean;
  referenceTitle?: string;
  referenceDescription?: string;
  referenceModeTitle?: string;
  referenceModeOptions?: readonly AiToolModeOption[];
  defaultReferenceMode?: string;
  showAspectRatio?: boolean;
  showDimensions?: boolean;
  showGenerationCount?: boolean;
  defaultOutputCount?: number;
  showPrompt?: boolean;
  defaultMode: string;
  primaryAction: string;
  estimate: string;
  guide: readonly { title: string; desc: string }[];
};

export const AI_TOOL_UI_CONFIG: Record<AiToolSlug, AiToolUiConfig> = {
  matting: {
    slug: "matting",
    operation: "matting",
    featureKey: "aiMatting",
    title: "AI抠图",
    shortDescription: "自动识别主体，输出透明背景 PNG",
    tooltip: "支持人像、服饰、商品与图案主体。阿里云图像分割权限接入后会直接启用真实处理。",
    uploadTitle: "待抠图",
    uploadHint: "上传、拖拽或从资源仓库选择图片",
    uploadRequirement: `支持 JPG、PNG、WebP，单次最多 ${STANDARD_MULTI_IMAGE_UPLOAD_LIMIT} 张`,
    maxImages: STANDARD_MULTI_IMAGE_UPLOAD_LIMIT,
    capability: "segment",
    providerLabel: "阿里云分割",
    modeTitle: "模式选择",
    modeDescription: "根据图片内容选择主体类型，可获得更干净的边缘。",
    modeOptions: [
      { value: "auto", label: "智能识别" },
      { value: "general", label: "通用" },
      { value: "person", label: "人像" },
      { value: "clothing", label: "服饰" },
      { value: "pattern", label: "图案" },
    ],
    defaultMode: "auto",
    primaryAction: "开始抠图",
    estimate: "通常需要 10–30 秒",
    guide: [
      { title: "上传商品图", desc: "支持批量上传，也可以直接使用资源仓库图片。" },
      { title: "选择主体类型", desc: "智能识别适合大多数场景，复杂边缘可指定分类。" },
      { title: "下载透明 PNG", desc: "结果先转存到项目 OSS，再提供预览与下载。" },
    ],
  },
  upscale: {
    slug: "upscale",
    operation: "upscale",
    featureKey: "imageUpscale",
    title: "图片超清",
    shortDescription: "放大分辨率，同时保护人脸、纹理与文字",
    tooltip: "使用专用超分辨率服务，不通过通用生图模型重绘原图。阿里云超清能力需要独立于分割服务开通。",
    uploadTitle: "待修复图",
    uploadHint: "上传需要提升清晰度的图片",
    uploadRequirement: `建议原图长边不超过 2560px，单次最多 ${STANDARD_MULTI_IMAGE_UPLOAD_LIMIT} 张`,
    maxImages: STANDARD_MULTI_IMAGE_UPLOAD_LIMIT,
    capability: "upscale",
    providerLabel: "阿里云超分",
    modeTitle: "模型",
    modeDescription: "不同模式会优先保护对应的高频细节。",
    modeOptions: [
      { value: "fashion", label: "鞋服模式", description: "纹理、走线与 Logo" },
      { value: "portrait", label: "人像模式", description: "面部与发丝细节" },
    ],
    defaultMode: "fashion",
    primaryAction: "提升清晰度",
    estimate: "通常需要 20–60 秒",
    guide: [
      { title: "上传模糊图", desc: "优先选择主体清楚、压缩不过度的原图。" },
      { title: "选择 2× 或 4×", desc: "2× 更稳定，4× 适合小尺寸素材。" },
      { title: "对比并下载", desc: "在右侧放大检查文字、Logo 与边缘。" },
    ],
  },
  outpaint: {
    slug: "outpaint",
    operation: "outpaint",
    featureKey: "aiOutpaint",
    title: "AI扩图",
    shortDescription: "延展画布并智能补全画面之外的内容",
    tooltip: "使用支持 outpainting 的图像编辑模型；原图区域会在服务端重新覆盖，避免中心内容漂移。",
    uploadTitle: "原图",
    uploadHint: "上传需要延展画面的图片",
    uploadRequirement: `支持 JPG、PNG、WebP，单次最多 ${STANDARD_MULTI_IMAGE_UPLOAD_LIMIT} 张`,
    maxImages: STANDARD_MULTI_IMAGE_UPLOAD_LIMIT,
    capability: "outpaint",
    providerLabel: "生图编辑模型",
    showAspectRatio: true,
    showDimensions: true,
    showGenerationCount: true,
    defaultMode: "bottom",
    primaryAction: "立即扩图",
    estimate: "通常需要 30–90 秒",
    guide: [
      { title: "上传原图", desc: "主体完整、边缘留白清晰时扩展效果更自然。" },
      { title: "设定目标画布", desc: "选择比例或输入精确宽高，系统自动生成扩展蒙版。" },
      { title: "生成并检查衔接", desc: "原图像素会锁定，仅生成画布新增区域。" },
    ],
  },
  erase: {
    slug: "erase",
    operation: "erase",
    featureKey: "aiErase",
    title: "AI消除",
    shortDescription: "涂抹不需要的元素，智能修补背景",
    tooltip: "白色蒙版区域允许模型修改；未涂抹区域由服务端强制使用原图像素，避免全图漂移。",
    uploadTitle: "待消除图",
    uploadHint: "上传后在右侧涂抹需要消除的区域",
    uploadRequirement: `支持 JPG、PNG、WebP，单次最多 ${STANDARD_MULTI_IMAGE_UPLOAD_LIMIT} 张`,
    maxImages: STANDARD_MULTI_IMAGE_UPLOAD_LIMIT,
    capability: "inpaint",
    providerLabel: "局部重绘模型",
    modeTitle: "生成配置",
    modeOptions: [
      { value: "fast", label: "快速模式", description: "适合纯色与简单背景" },
      { value: "quality", label: "标准模式", description: "复杂纹理与遮挡优先" },
    ],
    requiresMask: true,
    showPrompt: true,
    defaultMode: "quality",
    primaryAction: "消除选中区域",
    estimate: "通常需要 20–60 秒",
    guide: [
      { title: "上传图片", desc: "选择要清理杂物、人物或文字的图片。" },
      { title: "涂抹目标区域", desc: "画笔完整覆盖目标，并略微超过对象边缘。" },
      { title: "生成自然背景", desc: "未选区域保持原像素，只修补蒙版范围。" },
    ],
  },
  "hand-foot-repair": {
    slug: "hand-foot-repair",
    operation: "repair-limbs",
    featureKey: "handFootRepair",
    title: "手脚修复",
    shortDescription: "自动识别并修复手脚结构与细节",
    tooltip: "系统会先识别手脚区域，也可以在编辑器中选择仅修手、仅修脚或修手脚，并继续涂抹微调。",
    uploadTitle: "待修复图",
    uploadHint: "上传需要修复手脚的人物图片",
    uploadRequirement: "建议待修复图长边大于 1000px，且手脚清晰可见",
    maxImages: 1,
    capability: "inpaint",
    providerLabel: "局部重绘模型",
    requiresMask: true,
    showGenerationCount: true,
    defaultOutputCount: 1,
    defaultMode: "auto",
    primaryAction: "修复手脚",
    estimate: "通常需要 30–90 秒",
    guide: [
      { title: "上传人物图", desc: "手脚越清晰，结构修复越可靠。" },
      { title: "确认修复选区", desc: "可快捷选择手、脚或手脚，并用画笔继续调整。" },
      { title: "生成备选结果", desc: "可生成多张并挑选结构最自然的一张。" },
    ],
  },
  "clothing-repair": {
    slug: "clothing-repair",
    operation: "repair-garment",
    featureKey: "clothingRepair",
    title: "服饰修复",
    shortDescription: "修复版型、纹理、五金、图案与服饰边缘",
    tooltip: "目标图与参考商品图分角色上传；修复区域外强制保留原图，Logo 与商品事实优先保真。",
    uploadTitle: "待修复图",
    uploadHint: "上传需要修复的穿着图或商品图",
    uploadRequirement: "建议修复区域无遮挡，单次处理 1 张目标图",
    maxImages: 1,
    capability: "inpaint",
    providerLabel: "局部重绘模型",
    modeTitle: "修复类型",
    modeOptions: [
      { value: "style", label: "款式修复", description: "版型、轮廓与结构" },
      { value: "detail", label: "细节修复", description: "纹理、图案与五金" },
    ],
    requiresMask: true,
    requiresReference: true,
    referenceTitle: "参考商品图",
    referenceDescription: "上传对应的平铺图、人台图或清晰商品图。",
    referenceModeTitle: "参考图类型",
    referenceModeOptions: [
      { value: "flat", label: "平铺图" },
      { value: "model", label: "人台/模特图" },
    ],
    defaultReferenceMode: "flat",
    showGenerationCount: true,
    defaultOutputCount: 2,
    showPrompt: true,
    defaultMode: "style",
    primaryAction: "修复服饰",
    estimate: "通常需要 40–120 秒",
    guide: [
      { title: "上传目标图", desc: "标记款式或细节存在问题的局部区域。" },
      { title: "补充商品参考", desc: "平铺或人台图可帮助模型恢复真实结构。" },
      { title: "检查商品保真", desc: "重点核对 Logo、纹理、五金与边缘。" },
    ],
  },
  "shoe-repair": {
    slug: "shoe-repair",
    operation: "repair-footwear",
    featureKey: "shoeRepair",
    title: "鞋靴修复",
    shortDescription: "修复鞋型、左右脚关系、材质与接地阴影",
    tooltip: "使用局部重绘模型与商品参考图，锁定鞋靴轮廓、Logo、鞋底和地面接触关系。",
    uploadTitle: "待修复图",
    uploadHint: "上传需要修复鞋靴细节的图片",
    uploadRequirement: "建议鞋靴主体完整且轮廓可见",
    maxImages: 1,
    capability: "inpaint",
    providerLabel: "局部重绘模型",
    requiresMask: true,
    requiresReference: true,
    referenceTitle: "参考商品图",
    referenceDescription: "上传清晰鞋靴商品图，并标记需要参考的局部。",
    showGenerationCount: true,
    defaultOutputCount: 2,
    showPrompt: true,
    defaultMode: "structure",
    primaryAction: "修复鞋靴",
    estimate: "通常需要 40–120 秒",
    guide: [
      { title: "上传目标图", desc: "完整保留人物与场景，只标记鞋靴问题。" },
      { title: "添加商品参考", desc: "参考图用于恢复鞋型、材质、图案与 Logo。" },
      { title: "检查接地关系", desc: "重点确认左右脚、鞋底和接触阴影自然。" },
    ],
  },
  resize: {
    slug: "resize",
    operation: "resize",
    featureKey: "losslessResize",
    title: "无损改尺寸",
    shortDescription: "高质量调整尺寸，不通过生成模型重绘内容",
    tooltip: "尺寸变化会发生重采样；本工具使用 Sharp 高质量缩放与裁切，不修改图像语义。需要补画内容时请使用 AI 扩图。",
    uploadTitle: "原图",
    uploadHint: "上传需要调整画布尺寸的图片",
    uploadRequirement: `支持 JPG、PNG、WebP，单次最多 ${STANDARD_MULTI_IMAGE_UPLOAD_LIMIT} 张`,
    maxImages: STANDARD_MULTI_IMAGE_UPLOAD_LIMIT,
    capability: "resize",
    providerLabel: "本地 Sharp",
    showAspectRatio: true,
    showDimensions: true,
    defaultMode: "contain",
    primaryAction: "调整尺寸",
    estimate: "通常数秒内完成",
    guide: [
      { title: "上传原图", desc: "图片不会送入生图模型，也不会被语义重绘。" },
      { title: "调整生成范围", desc: "选择比例与尺寸，并移动或缩放高亮裁剪框。" },
      { title: "高质量导出", desc: "保持色彩与透明通道，按指定格式输出。" },
    ],
  },
};

export function isAiToolSlug(value: string): value is AiToolSlug {
  return AI_TOOL_SLUGS.includes(value as AiToolSlug);
}

export function getAiToolUiConfig(slug: AiToolSlug) {
  return AI_TOOL_UI_CONFIG[slug];
}
