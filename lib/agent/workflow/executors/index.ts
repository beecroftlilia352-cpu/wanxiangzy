import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";
import { gatewayGenerateImages, gatewayTryOn } from "@/lib/agent/workflow/model-gateway";
import { checkImageOutputs } from "@/lib/agent/workflow/quality";
import {
  buildCommerceDetailSectionPrompt,
  buildCommerceDetailSections,
  normalizeCommerceDetailLayout,
  resolveCommerceDetailAspectRatio,
} from "@/lib/commerce-detail-sections";
import { buildFaceSwapPrompt, enforceFaceSwapPromptRequirements } from "@/lib/face-swap";
import type {
  StepExecutionInput,
  StepExecutionResult,
  WorkflowStepRecord,
  WorkflowToolType,
} from "@/lib/agent/workflow/types";

type StepExecutor = (input: StepExecutionInput) => Promise<StepExecutionResult>;

export const STEP_EXECUTORS: Partial<Record<WorkflowToolType, StepExecutor>> = {
  text_to_image: executeTextToImage,
  image_to_image: executeImageToImage,
  commerce_detail: executeCommerceDetail,
  commerce_creative: executeCommerceCreative,
  background_replace: executeBackgroundReplace,
  garment_3d: executeGarment3d,
  tryon: executeTryon,
  face_swap: executeFaceSwap,
  pose_variation: executePoseVariation,
  commerce_detail_section: executeCommerceDetailSection,
  commerce_detail_stitch: executeCommerceDetailStitch,
  select_image: executeSelectImage,
  image_quality_check: executeQualityCheck,
  prompt_repair: executePromptRepair,
};

export function getStepExecutor(type: WorkflowToolType) {
  return STEP_EXECUTORS[type] || null;
}

async function executeTextToImage(input: StepExecutionInput) {
  return runImageGeneration(input, {
    images: [],
    promptKind: undefined,
    fallbackPrompt: String(input.step.params.prompt || input.workflow.summary || "professional commercial visual"),
  });
}

async function executeImageToImage(input: StepExecutionInput) {
  return runImageGeneration(input, {
    images: resolveImageList(input, input.step.input.sourceImages || input.step.input.sourceImage),
    promptKind: undefined,
    fallbackPrompt: String(input.step.params.prompt || input.workflow.summary || "regenerate based on reference images"),
  });
}

async function executeCommerceDetail(input: StepExecutionInput) {
  const prompt = [
    "生成可用于淘宝/天猫/京东的商品详情页或电商长图版式。",
    "必须包含首屏主视觉、核心卖点区、细节展示区、参数/功能区，具备清晰标题、卖点文案、图标和分区层级。",
    "不要生成单张生活方式照片或小红书种草图。",
    String(input.step.params.prompt || input.workflow.summary || ""),
  ].join("\n");
  return runImageGeneration(input, {
    images: resolveImageList(input, input.step.input.referenceImages),
    promptKind: undefined,
    fallbackPrompt: prompt,
  });
}

async function executeCommerceDetailSection(input: StepExecutionInput) {
  const params = input.step.params;
  const sectionIndex = Number(params.sectionIndex || 1);
  const sectionTotal = Number(params.sectionTotal || 1);
  const layout = normalizeCommerceDetailLayout(params.layout);
  const defaultSection = buildCommerceDetailSections(sectionTotal)[sectionIndex - 1] || buildCommerceDetailSections(1)[0];
  const section = {
    ...defaultSection,
    title: String(params.sectionTitle || defaultSection.title || input.step.title || `Detail section ${sectionIndex}`),
    purpose: String(params.sectionPurpose || defaultSection.purpose || ""),
    template: String(params.sectionTemplate || defaultSection.template || ""),
  };
  const references = resolveImageList(input, input.step.input.referenceImages);
  const prompt = buildCommerceDetailSectionPrompt({
    userPrompt: String(params.prompt || input.workflow.summary || ""),
    platform: String(params.platform || "general"),
    layout,
    mobileWidth: Number(params.mobileWidth || 750),
    section,
    sectionIndex,
    sectionTotal,
    referenceCount: references.length,
  });
  const result = await gatewayGenerateImages({
    model: input.model,
    prompt,
    promptKind: "commerceDetail",
    toolType: "commerce_detail_section",
    aspectRatio: resolveCommerceDetailAspectRatio(layout, input.aspectRatio),
    imageSize: input.imageSize,
    images: references,
    count: 1,
    onProgress: input.onProgress,
  });
  return persistAndCheck(input, result.urls, result.promptTrace, result.providerTrace, 1);
}

async function executeCommerceDetailStitch(input: StepExecutionInput): Promise<StepExecutionResult> {
  const urls = resolveImageList(input, input.step.input.imageUrls || input.step.input.images);
  if (!urls.length) throw new Error("详情页拼接步骤缺少可拼接图片");
  const width = clampNumber(input.step.params.width || input.step.params.mobileWidth || 750, 320, 1440);
  const sectionHeight = clampNumber(input.step.params.sectionHeight || 1000, 480, 1800);
  const gap = clampNumber(input.step.params.gap ?? 0, 0, 80);
  const background = typeof input.step.params.background === "string" ? input.step.params.background : "#ffffff";
  const stitched = buildCommerceDetailSvgDataUrl(urls, { width, sectionHeight, gap, background });
  const quality = await checkImageOutputs([stitched], 1);
  return {
    output: {
      imageUrls: [stitched],
      text: `已拼接 ${urls.length} 个详情页板块，手机宽度 ${width}px。`,
    },
    quality,
  };
}

async function executeCommerceCreative(input: StepExecutionInput) {
  const prompt = [
    "生成电商主图、banner、活动海报或推广视觉。",
    "画面需要明确商品主体、商业标题区、卖点文案区和可投放的版式层级。",
    String(input.step.params.prompt || input.workflow.summary || ""),
  ].join("\n");
  return runImageGeneration(input, {
    images: resolveImageList(input, input.step.input.referenceImages),
    promptKind: undefined,
    fallbackPrompt: prompt,
  });
}

async function executeBackgroundReplace(input: StepExecutionInput) {
  const images = [
    ...resolveImageList(input, input.step.input.sourceImage),
    ...resolveImageList(input, input.step.input.backgroundReference),
  ];
  const prompt = [
    "保留主体身份、服装、比例和真实光影关系，只替换背景/场景并自然融合。",
    String(input.step.params.prompt || input.workflow.summary || ""),
  ].join("\n");
  return runImageGeneration(input, { images, promptKind: "modelBackground", fallbackPrompt: prompt });
}

async function executeGarment3d(input: StepExecutionInput) {
  const images = resolveImageList(input, input.step.input.garmentImage || input.step.input.sourceImage);
  const prompt = [
    "生成服装或商品的 3D 展示感商品图，主体完整清晰，适合电商详情页或主图素材。",
    "保留商品结构、颜色、面料纹理、logo 和关键细节，背景干净，商业产品摄影质感。",
    String(input.step.params.prompt || input.workflow.summary || ""),
  ].join("\n");
  return runImageGeneration(input, { images, promptKind: "garment3d", fallbackPrompt: prompt });
}

async function executeTryon(input: StepExecutionInput): Promise<StepExecutionResult> {
  const clothingUrls = resolveImageList(input, input.step.input.clothingImage || input.step.input.garmentImage);
  const referenceUrl = resolveImageList(input, input.step.input.personImage || input.step.input.referenceImage)[0];
  if (!clothingUrls.length) throw new Error("换装步骤缺少服装图");

  const count = normalizeCount(input.step.params.count || 1);
  const result = await gatewayTryOn({
    model: input.model,
    clothingUrls,
    referenceUrl,
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
    count,
    style: typeof input.step.params.style === "string" ? input.step.params.style : undefined,
    onProgress: input.onProgress,
  });
  return persistAndCheck(input, result.urls, result.promptTrace, result.providerTrace, count);
}

async function executeFaceSwap(input: StepExecutionInput): Promise<StepExecutionResult> {
  const source = resolveImageList(input, input.step.input.sourceImage || input.step.input.originalImage || input.step.input.modelImage)[0];
  const face = resolveImageList(input, input.step.input.faceImage || input.step.input.targetFaceImage || input.step.input.referenceImage)[0];
  if (!source || !face) {
    throw new Error("换脸需要两张图：原始模特图和目标脸图");
  }

  const count = normalizeCount(input.step.params.count || input.step.params.genCount || 1);
  const prompt = enforceFaceSwapPromptRequirements(
    buildFaceSwapPrompt(String(input.step.params.prompt || input.workflow.summary || ""))
  );
  const result = await gatewayGenerateImages({
    model: input.model,
    prompt,
    promptKind: "faceSwap",
    toolType: "face_swap",
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
    images: [source, face],
    count,
    onProgress: input.onProgress,
  });
  return persistAndCheck(input, result.urls, result.promptTrace, result.providerTrace, count);
}

async function executePoseVariation(input: StepExecutionInput) {
  const source = resolveImageList(input, input.step.input.sourceImage)[0];
  if (!source) throw new Error("姿势裂变步骤缺少主图");
  const requestedCount = normalizeCount(input.step.params.count || input.step.params.genCount || 4);
  const outputMode = resolvePoseOutputMode(input.step, requestedCount);
  const generationCount = outputMode === "separate" ? requestedCount : 1;
  const prompt = [
    outputMode === "separate"
      ? "基于主图生成一组不同姿势的独立图片，保持人物身份、服装结构、身体比例和光线质感稳定。"
      : "基于主图生成 2x2 四宫格姿势变化图，保持人物身份、服装结构、身体比例和光线质感稳定。",
    "姿势自然可信，头部、颈部、肩膀和躯干转向协调一致，避免单独回头、过度扭颈、肩颈错位、手指、关节、肢体拉长和换脸。",
    String(input.step.params.prompt || input.workflow.summary || ""),
    outputMode === "separate"
      ? `Output contract: this workflow will make ${generationCount} separate calls. Each call must return exactly one standalone fashion photo with pose-appropriate framing. Do not create a collage, four-grid, 2x2 layout, split panel, contact sheet, or pose sheet.`
      : "Output contract: create one 2x2 four-panel grid image.",
  ].join("\n");
  const result = await gatewayGenerateImages({
    model: input.model,
    prompt,
    promptKind: "pose",
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
    images: [source],
    count: generationCount,
    onProgress: input.onProgress,
    promptForIndex: outputMode === "separate"
      ? (index, total) => [
        prompt,
        `This is variation ${index} of ${total}. Generate only one standalone image for this call.`,
        getPoseVariationBrief(index),
      ].join("\n")
      : undefined,
  });
  return persistAndCheck(input, result.urls, result.promptTrace, result.providerTrace, generationCount);
}

function resolvePoseOutputMode(step: WorkflowStepRecord, requestedCount: number): "separate" | "grid" {
  const rawMode = String(step.params.outputMode || step.params.output_mode || step.params.outputType || "").toLowerCase();
  const intentText = [
    step.title,
    step.params.userText,
    step.params.originalPrompt,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .join(" ");

  if (rawMode === "separate" || rawMode === "single" || rawMode === "individual") return "separate";
  if (hasExplicitGridIntent(intentText)) return "grid";
  if (requestedCount > 1) return "separate";
  return rawMode === "grid" ? "grid" : "separate";
}

function hasExplicitGridIntent(text: string) {
  return /\u56db\u5bab\u683c|\u5bab\u683c|\u62fc\u56fe|\u5206\u683c|2\s*[x\u00d7]\s*2|grid|collage|contact\s*sheet|pose\s*sheet/i.test(text);
}

function getPoseVariationBrief(index: number) {
  const briefs = [
    "Pose direction: calm front-facing fashion stance with natural arms, relaxed direct gaze.",
    "Pose direction: slight body angle with one hand near waist or pocket, soft slight smile or side gaze.",
    "Pose direction: gentle contrapposto stance, one arm changing naturally, confident editorial gaze.",
    "Pose direction: subtle side or three-quarter turn, head and torso aligned in the same direction, stable posture, clothing still clearly visible, candid natural expression.",
  ];
  return briefs[(index - 1) % briefs.length];
}

async function executeSelectImage(input: StepExecutionInput): Promise<StepExecutionResult> {
  const candidates = resolveImageList(input, input.step.input.imageUrls || input.step.input.images || input.step.input.sourceImages);
  const selectedImageUrl = candidates[0];
  if (!selectedImageUrl) throw new Error("没有可选择的候选图片");
  return {
    output: {
      selectedImageUrl,
      imageUrls: [selectedImageUrl],
      text: "已自动选择第一张候选图；用户可在前端改选。",
    },
    quality: await checkImageOutputs([selectedImageUrl], 1),
  };
}

async function executeQualityCheck(input: StepExecutionInput): Promise<StepExecutionResult> {
  const urls = resolveImageList(input, input.step.input.imageUrls || input.step.input.images);
  const quality = await checkImageOutputs(urls, urls.length || 1);
  return {
    output: {
      imageUrls: urls,
      text: quality.checks.map((check) => `${check.label}: ${check.status} - ${check.detail}`).join("\n"),
    },
    quality,
  };
}

async function executePromptRepair(input: StepExecutionInput): Promise<StepExecutionResult> {
  const prompt = String(input.step.params.prompt || "");
  const issue = String(input.step.params.issue || input.workflow.error_message || "用户反馈需要修复");
  return {
    output: {
      text: `${prompt}\n修复要求：${issue}\n严格优先满足用户原始目标，不要擅自切换任务类型。`,
    },
  };
}

async function runImageGeneration(
  input: StepExecutionInput,
  options: {
    images: string[];
    promptKind?: "model" | "grass" | "modelBackground" | "pose" | "garment3d" | "tryon";
    fallbackPrompt: string;
  }
) {
  const count = normalizeCount(input.step.params.count || input.step.params.genCount || 1);
  const result = await gatewayGenerateImages({
    model: input.model,
    prompt: String(input.step.params.prompt || options.fallbackPrompt),
    promptKind: options.promptKind,
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
    images: options.images,
    count,
    onProgress: input.onProgress,
  });
  return persistAndCheck(input, result.urls, result.promptTrace, result.providerTrace, count);
}

async function persistAndCheck(
  input: StepExecutionInput,
  rawUrls: string[],
  promptTrace: StepExecutionResult["promptTrace"],
  providerTrace: StepExecutionResult["providerTrace"],
  expectedCount: number
): Promise<StepExecutionResult> {
  const persisted = await persistGeneratedImageUrls(rawUrls, `${input.workflow.id}-${input.step.step_key}`, {
    forceServerDownload: rawUrls.some((url) => url.startsWith("http")),
  });
  const quality = await checkImageOutputs(persisted, expectedCount);
  return {
    output: { imageUrls: persisted },
    promptTrace,
    providerTrace,
    quality,
  };
}

function resolveImageList(input: StepExecutionInput, value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => resolveImageList(input, item));
  const single = resolveImageRef(input, value);
  return single ? [single] : [];
}

function resolveImageRef(input: StepExecutionInput, value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("http") || value.startsWith("data:image/")) return value;

  const readableImageMatch = value.match(/(?:\u56fe|image:)\s*(\d+)/i);
  if (readableImageMatch) {
    const index = Number(readableImageMatch[1]);
    return input.inputImages.find((img) => img.index === index)?.url || null;
  }

  const imageMatch = value.match(/(?:图|image:)\s*(\d+)/i);
  if (imageMatch) {
    const index = Number(imageMatch[1]);
    return input.inputImages.find((img) => img.index === index)?.url || null;
  }

  const stepMatch = value.match(/^\$?([A-Za-z0-9_-]+)\.output\.(imageUrls|selectedImageUrl)(?:\[(\d+)])?$/);
  if (stepMatch) {
    const [, stepKey, field, rawIndex] = stepMatch;
    const step = input.steps.find((item) => item.step_key === stepKey || item.id === stepKey);
    if (!step?.output) return null;
    if (field === "selectedImageUrl") return step.output.selectedImageUrl || step.output.imageUrls?.[0] || null;
    const index = Number(rawIndex || 0);
    return step.output.imageUrls?.[index] || null;
  }

  return null;
}

function normalizeCount(value: unknown) {
  const num = Number(value || 1);
  if (!Number.isFinite(num)) return 1;
  return Math.min(Math.max(Math.floor(num), 1), 4);
}

function clampNumber(value: unknown, min: number, max: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(Math.max(Math.floor(num), min), max);
}

function getCommercePlatformGuidance(platform: string) {
  const normalized = platform.toLowerCase();
  if (/xiaohongshu|red|小红书|\u5c0f\u7ea2\u4e66/.test(normalized)) {
    return "Platform tone: Xiaohongshu-style useful content, clean lifestyle mood, authentic selling points, not overstuffed with text.";
  }
  if (/douyin|tiktok|抖音|\u6296\u97f3/.test(normalized)) {
    return "Platform tone: Douyin commerce visual, strong hook, bold benefit hierarchy, fast-scanning mobile layout.";
  }
  if (/pdd|pinduoduo|拼多多|\u62fc\u591a\u591a/.test(normalized)) {
    return "Platform tone: PDD commerce visual, clear value proposition, direct benefits, strong readability and conversion focus.";
  }
  if (/taobao|tmall|淘宝|天猫|\u6dd8\u5b9d|\u5929\u732b/.test(normalized)) {
    return "Platform tone: Taobao/Tmall detail page, structured product story, premium but readable mobile e-commerce design.";
  }
  if (/jd|jingdong|京东|\u4eac\u4e1c/.test(normalized)) {
    return "Platform tone: JD detail page, trustworthy product specification, clean sections, precise benefit and parameter presentation.";
  }
  return "Platform tone: universal mobile commerce detail page, adaptable to marketplace, content commerce, or independent store use.";
}

function buildCommerceDetailSvgDataUrl(
  urls: string[],
  options: { width: number; sectionHeight: number; gap: number; background: string }
) {
  const totalHeight = urls.length * options.sectionHeight + Math.max(0, urls.length - 1) * options.gap;
  const images = urls.map((url, index) => {
    const y = index * (options.sectionHeight + options.gap);
    return `<image href="${escapeXml(url)}" x="0" y="${y}" width="${options.width}" height="${options.sectionHeight}" preserveAspectRatio="xMidYMid slice"/>`;
  }).join("");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${totalHeight}" viewBox="0 0 ${options.width} ${totalHeight}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>`,
    images,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
