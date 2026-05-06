import type {
  AgentBrainDecision,
  AgentBrainModule,
  AgentBrainRequest,
  AgentBrainTrace,
  BrainVisualTaskPlan,
  BrainVisualTaskType,
  ImageUnderstandingResult,
} from "@/lib/agent/brain/types";
import { callBrainJson } from "@/lib/agent/brain/llm-json";
import { addTraceEvent } from "@/lib/agent/brain/trace";
import { buildPreferencePrompt } from "@/lib/agent/brain/preferences";
import type { CandidateWorkflowTool } from "@/lib/agent/brain/tool-selector";
import { buildKnowledgePrompt } from "@/lib/agent/brain/knowledge";

export async function routeSemantically(params: {
  request: AgentBrainRequest;
  imageUnderstanding: ImageUnderstandingResult | null;
  candidateTools?: CandidateWorkflowTool[];
  trace: AgentBrainTrace;
}): Promise<AgentBrainDecision> {
  const parsed = await callBrainJson({
    kind: params.request.images.length ? "vision" : "text",
    stage: "semantic_router",
    trace: params.trace,
    temperature: 0.12,
    maxTokens: 1600,
    system: [
      "You are Semantic Router Agent for a production fashion/ecommerce visual AI product.",
      "Return ONLY JSON. No markdown.",
      "Decide by semantic user goal, not keywords alone.",
      "If confidence is low, choose action='clarify'. Do not guess a paid generation task.",
      "Chat mode means no paid generation or workflow creation.",
      "Taobao/Tmall/JD detail page means commerce_detail, not Xiaohongshu/grass.",
      "Video and true 3D asset generation are reserved capabilities; clarify that they are not enabled instead of planning them.",
    ].join("\n"),
    text: buildRouterPrompt(params.request, params.imageUnderstanding, params.candidateTools || []),
    images: params.request.images.slice(0, 8).map((img) => img.url),
  });

  const normalized = normalizeRouterOutput(parsed, params.request, params.imageUnderstanding);
  if (normalized.source !== "llm") {
    addTraceEvent(params.trace, {
      stage: "semantic_router",
      status: "fallback",
      summary: "Semantic router used deterministic fallback.",
      data: { action: normalized.action, module: normalized.module, confidence: normalized.confidence },
    });
  }
  return normalized;
}

function buildRouterPrompt(
  request: AgentBrainRequest,
  imageUnderstanding: ImageUnderstandingResult | null,
  candidateTools: CandidateWorkflowTool[]
) {
  const images = request.images.map((img) => ({
    index: img.index,
    explicitRole: img.role || "auto",
    fileName: img.fileName || "",
  }));
  return [
    "Output schema:",
    JSON.stringify({
      action: "chat|generate|clarify",
      module: "general|tryon|grass|garment_3d|model|model_background|pose|face_swap|null",
      taskType: "text_to_image|image_to_image|commerce_detail|commerce_creative|reference_redesign|tryon|pose_variation|garment_3d|background_replace|face_swap|null",
      reply: "Chinese answer or confirmation preface",
      clarificationQuestion: "one concise Chinese question if action=clarify",
      confidence: 0.0,
      params: {},
      style: "string|null",
      preferredAspectRatio: "3:4|1:1|9:16|4:3|16:9|null",
      useImages: true,
      missingFields: ["string"],
      reasoningSummary: "short audit summary, no hidden chain of thought",
    }),
    "",
    "Available modules:",
    "- general: generic text-to-image/image-to-image, ecommerce detail page, ecommerce main image/banner, reference redesign",
    "- tryon: put clothing onto a person/model/reference pose",
    "- grass: Xiaohongshu/lifestyle seeding image only when user asks for it",
    "- garment_3d: 3D-style product display image, not true 3D asset",
    "- model: create exclusive model/reference face",
    "- model_background: replace background/scene",
    "- pose: pose variation/four-grid/separate pose images",
    "- face_swap: swap only facial features from a target face onto an original model image; keep skin tone, hairstyle, body, clothes, background, lighting, camera, and framing unchanged",
    "",
    "Dynamic candidate tools:",
    candidateTools.length ? JSON.stringify(candidateTools) : "[]",
    "Candidate tools are hints, not hard rules. Choose chat/clarify when that better matches the user's real goal.",
    "",
    "Persistent user preferences:",
    buildPreferencePrompt(request.userPreferences),
    "",
    "Brand/project knowledge:",
    buildKnowledgePrompt(request.projectKnowledge),
    "",
    `Intent mode: ${request.intentMode}`,
    `User request: ${request.userText || "用户只上传图片，等待分析或建议。"}`,
    request.history?.length ? `Recent conversation: ${JSON.stringify(request.history.slice(-6))}` : "",
    request.lastTask ? `Last task: ${JSON.stringify(request.lastTask)}` : "",
    `Images metadata: ${JSON.stringify(images)}`,
    imageUnderstanding ? `Image understanding: ${JSON.stringify(imageUnderstanding)}` : "Image understanding: none",
    "",
    "Critical examples:",
    "- “生成淘宝详情页/详情页/长图/卖点图” => module general, taskType commerce_detail.",
    "- “图2人物穿图1衣服” => module tryon, params { clothing_urls:['图1'], reference_url:'图2' }.",
    "- “每张单独出图/4个不同姿势” => module pose, params { main_image_url:'图1', output_mode:'separate' }.",
    "- “分析/建议/怎么看” => action chat unless user explicitly asks to generate.",
  ].filter(Boolean).join("\n");
}

function normalizeRouterOutput(
  raw: Record<string, unknown> | null,
  request: AgentBrainRequest,
  imageUnderstanding: ImageUnderstandingResult | null
): AgentBrainDecision {
  if (!raw) return deterministicRouterFallback(request, imageUnderstanding);

  const action = normalizeAction(raw.action);
  const taskType = normalizeTaskType(raw.taskType);
  const visualTaskPlan = buildVisualTaskPlan({
    taskType,
    request,
    raw,
    confidence: clamp(raw.confidence, 0.2, 0.95),
  });
  const module = visualTaskPlan ? "general" : normalizeModule(raw.module);
  return {
    action,
    module: action === "generate" ? module : null,
    reply: buildReply(raw, request, action),
    params: normalizeParams(raw.params),
    style: typeof raw.style === "string" && raw.style !== "null" ? raw.style.trim() || null : null,
    confidence: clamp(raw.confidence, 0.2, 0.95),
    missingFields: stringArray(raw.missingFields),
    source: "llm",
    visualTaskPlan,
    imageUnderstanding,
    safety: { allowed: true, requiresClarification: action === "clarify", reasons: [], blockedModules: [] },
    trace: requestTracePlaceholder(),
  };
}

function deterministicRouterFallback(
  request: AgentBrainRequest,
  imageUnderstanding: ImageUnderstandingResult | null
): AgentBrainDecision {
  const text = request.userText.trim();
  const hasImages = request.images.length > 0;
  let action: AgentBrainDecision["action"] = "chat";
  let module: AgentBrainModule | null = null;
  let visualTaskPlan: BrainVisualTaskPlan | null = null;
  let confidence = hasImages ? 0.52 : 0.48;
  const params: Record<string, unknown> = {};

  const faceSwapRefs = parseFaceSwapRefs(text);
  const wantsFaceSwap = isFaceSwapText(text);
  if (faceSwapRefs || (wantsFaceSwap && hasImages)) {
    action = "generate";
    module = "face_swap";
    if (faceSwapRefs) {
      params.source_image = faceSwapRefs.sourceRef;
      params.face_image = faceSwapRefs.faceRef;
    } else {
      params.source_image = "图1";
      params.face_image = request.images.length > 1 ? "图2" : "图1";
    }
    confidence = faceSwapRefs ? 0.88 : 0.78;
  } else if (wantsFaceSwap) {
    action = "clarify";
    module = null;
    confidence = 0.62;
  } else {
  const tryonRefs = parseTryonRefs(text);
  if (tryonRefs) {
    action = "generate";
    module = "tryon";
    params.clothing_urls = [tryonRefs.clothingRef];
    params.reference_url = tryonRefs.personRef;
    confidence = 0.86;
  } else if (isCommerceDetailText(text)) {
    action = "generate";
    module = "general";
    visualTaskPlan = buildCommerceDetailPlan(text, hasImages, 0.86);
    params.prompt = visualTaskPlan.prompt;
    confidence = 0.86;
  } else if (/小红书|种草|生活方式|街拍/.test(text) && hasImages) {
    action = "generate";
    module = "grass";
    params.garment_url = "图1";
    confidence = 0.78;
  } else if (/3d|3D|立体|悬浮|商品展示/.test(text) && hasImages) {
    action = "generate";
    module = "garment_3d";
    params.garment_url = "图1";
    confidence = 0.78;
  } else if (/姿势|四宫格|不同.*姿|pose/i.test(text) && hasImages) {
    action = "generate";
    module = "pose";
    params.main_image_url = "图1";
    const outputDefaults = isPlainObject(request.userPreferences?.outputDefaults)
      ? request.userPreferences.outputDefaults
      : {};
    if (/每张|单独|独立/.test(text) || outputDefaults.poseOutputMode === "separate") params.output_mode = "separate";
    if (/四宫格/.test(text) || outputDefaults.poseOutputMode === "grid") params.output_mode = "grid";
    confidence = 0.8;
  } else if (/生成|制作|出图|做一张|来一张|画一张|设计|改成|重做|重新/.test(text)) {
    action = "generate";
    module = "general";
    visualTaskPlan = {
      module: "general",
      label: hasImages ? "通用图生图" : "通用文生图",
      taskType: hasImages ? "reference_redesign" : "commerce_creative",
      preferredAspectRatio: undefined,
      prompt: buildGenericPrompt(text, hasImages ? "reference_redesign" : "commerce_creative"),
      useImages: hasImages,
      confidence: 0.7,
    };
    params.prompt = visualTaskPlan.prompt;
    confidence = 0.7;
  }
  }

  return {
    action,
    module,
    reply: action === "generate" ? "我已理解你的生成目标，会先整理成确认卡，确认后再执行。" : "我在，可以像顾问一样先帮你分析、判断图片关系，或把需求拆成可执行的视觉任务。",
    params,
    style: null,
    confidence,
    missingFields: [],
    source: "deterministic",
    visualTaskPlan,
    imageUnderstanding,
    safety: { allowed: true, requiresClarification: false, reasons: [], blockedModules: [] },
    trace: requestTracePlaceholder(),
  };
}

function buildVisualTaskPlan(params: {
  taskType: BrainVisualTaskType | null;
  request: AgentBrainRequest;
  raw: Record<string, unknown>;
  confidence: number;
}): BrainVisualTaskPlan | null {
  if (params.taskType === "commerce_detail") {
    return buildCommerceDetailPlan(params.request.userText, params.request.images.length > 0, params.confidence);
  }
  if (params.taskType === "commerce_creative") {
    return {
      module: "general",
      label: /banner/i.test(params.request.userText) ? "电商 Banner" : "电商主图",
      taskType: "commerce_creative",
      preferredAspectRatio: normalizeAspectRatioValue(params.raw.preferredAspectRatio) || (/banner/i.test(params.request.userText) ? "16:9" : "3:4"),
      prompt: buildGenericPrompt(params.request.userText, "commerce_creative"),
      useImages: Boolean(params.raw.useImages ?? params.request.images.length > 0),
      confidence: params.confidence,
    };
  }
  if (params.taskType === "reference_redesign" || params.taskType === "image_to_image") {
    return {
      module: "general",
      label: "通用图生图",
      taskType: "reference_redesign",
      preferredAspectRatio: normalizeAspectRatioValue(params.raw.preferredAspectRatio) || undefined,
      prompt: buildGenericPrompt(params.request.userText, "reference_redesign"),
      useImages: params.request.images.length > 0,
      confidence: params.confidence,
    };
  }
  return null;
}

function buildCommerceDetailPlan(text: string, hasImages: boolean, confidence: number): BrainVisualTaskPlan {
  return {
    module: "general",
    label: "淘宝详情页",
    taskType: "commerce_detail",
    preferredAspectRatio: "3:4",
    prompt: buildGenericPrompt(text, "commerce_detail"),
    useImages: hasImages,
    confidence,
  };
}

function buildGenericPrompt(text: string, type: "commerce_detail" | "commerce_creative" | "reference_redesign") {
  const lines = [
    type === "commerce_detail"
      ? "生成一张电商详情页长图视觉，必须包含首屏主视觉、核心卖点区、细节展示区、参数/功能信息区和清晰的版式层级。不要做成小红书种草图、街拍图或普通氛围照片。"
      : type === "commerce_creative"
        ? "生成一张可投放的电商商业视觉图，画面需要有明确商品主体、标题区、卖点层级和干净构图。"
        : "根据参考图和用户目标进行图生图重绘，保留用户关心的主体、风格方向和商业可用性。",
  ];
  if (text) lines.push(`用户原始需求：${text}`);
  return lines.join("\n");
}

function buildReply(raw: Record<string, unknown>, request: AgentBrainRequest, action: AgentBrainDecision["action"]) {
  if (action === "clarify") {
    return stringValue(raw.clarificationQuestion) || "我需要再确认一下你的目标，避免误生成。";
  }
  return stringValue(raw.reply) || (request.images.length ? "我已理解图片和你的需求，会先生成确认卡。" : "我已理解你的需求，会先整理成确认卡。");
}

function normalizeAction(value: unknown): AgentBrainDecision["action"] {
  if (value === "generate" || value === "clarify") return value;
  return "chat";
}

function normalizeModule(value: unknown): AgentBrainModule | null {
  if (typeof value !== "string") return null;
  if (["general", "tryon", "grass", "garment_3d", "model", "model_background", "pose", "face_swap"].includes(value)) return value as AgentBrainModule;
  return null;
}

function normalizeTaskType(value: unknown): BrainVisualTaskType | null {
  if (typeof value !== "string") return null;
  if (["commerce_detail", "commerce_creative", "reference_redesign", "text_to_image", "image_to_image"].includes(value)) return value as BrainVisualTaskType;
  if (value === "tryon" || value === "pose_variation" || value === "garment_3d" || value === "background_replace" || value === "face_swap") return null;
  return null;
}

function normalizeParams(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function clamp(value: unknown, min: number, max: number) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num > 1 ? num / 100 : num));
}

function normalizeAspectRatioValue(value: unknown): "3:4" | "1:1" | "9:16" | "4:3" | "16:9" | null {
  return typeof value === "string" && ["3:4", "1:1", "9:16", "4:3", "16:9"].includes(value)
    ? value as "3:4" | "1:1" | "9:16" | "4:3" | "16:9"
    : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCommerceDetailText(text: string) {
  return /详情页|长图|卖点图|参数图|功能图|淘宝|天猫|京东|店铺详情|商品详情/.test(text);
}

export function parseTryonRefs(text: string): { personRef: string; clothingRef: string } | null {
  const patterns = [
    {
      pattern: /图\s*(\d+)\s*(?:的)?(?:人物|模特|人)\s*(?:穿|换上|穿上|上身)\s*图\s*(\d+)\s*(?:的)?(?:衣服|服装|裙子|上衣|裤子|外套)?/,
      order: "personFirst" as const,
    },
    {
      pattern: /图\s*(\d+)\s*(?:的)?(?:衣服|服装|裙子|上衣|裤子|外套)\s*(?:穿到|穿在|给)\s*图\s*(\d+)\s*(?:的)?(?:人物|模特|人)/,
      order: "clothingFirst" as const,
    },
  ];
  for (const item of patterns) {
    const match = text.match(item.pattern);
    if (!match) continue;
    const first = `图${Number(match[1])}`;
    const second = `图${Number(match[2])}`;
    return item.order === "personFirst"
      ? { personRef: first, clothingRef: second }
      : { personRef: second, clothingRef: first };
  }
  return null;
}

export function parseFaceSwapRefs(text: string): { sourceRef: string; faceRef: string } | null {
  const patterns = [
    /图\s*(\d+).{0,10}(?:作为|当作|是|做|用作).{0,10}(?:原图|原始图|模特图|主图|目标图|底图).{0,24}图\s*(\d+).{0,10}(?:作为|当作|是|做|用作).{0,10}(?:脸图|目标脸|参考脸|人脸|五官)/,
    /(?:用|把|将)\s*图\s*(\d+).{0,12}(?:的脸|脸|五官|面部).{0,18}(?:给|为|替换到|换到|放到|应用到|套到).{0,8}图\s*(\d+)/,
    /图\s*(\d+).{0,18}(?:换脸|替换脸|换五官|替换五官|脸).{0,18}(?:图|到|成|为)\s*(\d+)/,
    /(?:把|将)?\s*图\s*(\d+).{0,18}(?:的脸|五官|面部).{0,18}(?:换到|替换到|放到|应用到|套到)\s*图\s*(\d+)/,
    /(?:把|将)?\s*图\s*(\d+).{0,18}(?:换成|换为|替换为|使用)\s*图\s*(\d+).{0,12}(?:的脸|五官|脸)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const first = `图${Number(match[1])}`;
    const second = `图${Number(match[2])}`;
    if (/给|为|替换到|换到|放到|应用到|套到/.test(match[0]) && !/(作为|当作|用作).{0,10}(?:原图|原始图|模特图|主图|目标图|底图)/.test(match[0])) {
      return { sourceRef: second, faceRef: first };
    }
    return { sourceRef: first, faceRef: second };
  }
  return null;
}

function isFaceSwapText(text: string) {
  return /换脸|替换脸|人脸替换|换五官|替换五官|face\s*swap/i.test(text);
}

function requestTracePlaceholder(): AgentBrainDecision["trace"] {
  return {
    id: "pending",
    version: "agent-brain-v2",
    startedAt: new Date().toISOString(),
    events: [],
  };
}
