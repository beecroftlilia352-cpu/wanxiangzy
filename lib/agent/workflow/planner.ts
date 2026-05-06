import { getChatCompletionsUrl, getLlmFallbackConfigs } from "@/lib/api/llm-provider";
import { getPlannerToolCatalog } from "@/lib/agent/workflow/tools";
import type {
  GenerationDefaults,
  ImageRoleResolution,
  WorkflowInputImage,
  WorkflowMode,
  WorkflowPlan,
  WorkflowStepPlan,
  WorkflowStepOutputShape,
  WorkflowToolType,
} from "@/lib/agent/workflow/types";

export type PlannerRequest = {
  userText: string;
  images: WorkflowInputImage[];
  mode: WorkflowMode;
  defaults: GenerationDefaults;
  conversationSummary?: string;
  activeWorkflowSummary?: string;
  userPreferences?: Record<string, unknown>;
};

type RawPlannerResponse = Partial<WorkflowPlan> & {
  action?: "chat" | "workflow" | "clarify";
};

export async function planWorkflow(request: PlannerRequest): Promise<WorkflowPlan> {
  if (request.mode === "chat") {
    return buildClarificationPlan("当前处于纯聊天模式，不会创建生成工作流。");
  }

  const missingVisualInputQuestion = getMissingVisualInputQuestion(request);
  if (missingVisualInputQuestion) {
    return buildClarificationPlan(missingVisualInputQuestion);
  }

  const llmPlan = await callPlannerModel(request).catch(() => null);
  const normalized = llmPlan ? normalizePlannerOutput(llmPlan, request) : null;
  const fallback = scheduleWorkflowPlan(buildFallbackPlan(request));
  if (normalized) {
    if (shouldPreferFallbackPlan(normalized, fallback, request)) return fallback;
    const guarded = guardPlanVisualInputs(normalized, request);
    return scheduleWorkflowPlan(guarded);
  }

  return fallback;
}

function getMissingVisualInputQuestion(request: PlannerRequest) {
  if (request.images.length > 0) return null;
  const text = request.userText;
  if (hasCommerceDetailIntent(text)) {
    return "要生成电商详情页，请先上传商品图、服装图或模特/场景素材图；如果你只是想先写详情页文案或板块结构，可以直接说明“只做文案规划”。";
  }
  if (/换脸|替换脸|换五官|替换五官|人脸替换|face\s*swap/i.test(text)) {
    return "AI 换脸需要两张图：原始模特图和目标脸图。我现在还没有可用图片，请先上传素材或去 AI 换脸页面选择官方脸库。";
  }
  if (/穿上|穿到|传到|转移到|套到|换到|换装|上身|试穿|把.*衣服.*(?:穿|传|转移|套|换)|(?:穿|传|转移|套|换).*衣服|衣服.*(?:穿|传|转移|套|换)|模特.*衣服/.test(text)) {
    return "换装任务需要至少上传人物图和服装图，我现在还没有可用图片。请先上传素材，或告诉我要改成纯文字方案。";
  }
  if (/姿势|站姿|动作|四宫格|多几个.*姿|不同.*姿|pose/i.test(text)) {
    return "姿势裂变需要一张人物/模特参考图，我现在还没有可用图片。请先上传参考图后再生成。";
  }
  if (/3d|3D|立体|悬浮|三维|商品展示/.test(text)) {
    return "3D 展示需要商品或服装参考图，我现在还没有可用图片。请先上传素材图。";
  }
  return null;
}

function guardPlanVisualInputs(plan: WorkflowPlan, request: PlannerRequest): WorkflowPlan {
  if (request.images.length > 0 || plan.needsClarification) return plan;
  const needsDetailAssets = plan.steps.some((step) =>
    ["commerce_detail", "commerce_detail_section", "commerce_detail_stitch"].includes(step.type)
  );
  if (!needsDetailAssets) return plan;
  return buildClarificationPlan(
    "这个详情页任务需要商品/服装/模特或场景素材图作为视觉依据。请先上传图片；如果只是要文案结构，请说明“只做文案规划”。"
  );
}

function scheduleWorkflowPlan(plan: WorkflowPlan): WorkflowPlan {
  if (!plan.steps.length) return plan;

  const steps = plan.steps.map((step) => ({
    ...step,
    dependsOn: [...step.dependsOn],
    input: { ...step.input },
    params: { ...step.params },
    expectedOutput: { ...step.expectedOutput },
    riskNotes: [...(step.riskNotes || [])],
  }));

  steps.forEach((step, index) => {
    if (step.type !== "commerce_detail_section") return;

    const upstream = findPreviousVisualProducer(steps, index);
    if (!upstream) return;

    const refs = getStepOutputImageRefs(upstream);
    step.dependsOn = uniqueStrings([...step.dependsOn, upstream.id]);
    step.input = {
      ...step.input,
      referenceImages: refs.length ? refs : step.input.referenceImages,
    };
    step.params = {
      ...step.params,
      upstreamSourceStep: upstream.id,
      sourceStrategy: "use_previous_visual_output",
    };
  });

  const detailSectionIds = steps.filter((step) => step.type === "commerce_detail_section").map((step) => step.id);
  steps.forEach((step) => {
    if (step.type !== "commerce_detail_stitch" || !detailSectionIds.length) return;
    step.dependsOn = uniqueStrings(detailSectionIds);
    step.input = { ...step.input, imageUrls: detailSectionIds.map((id) => `$${id}.output.imageUrls[0]`) };
  });

  return {
    ...plan,
    steps,
    summary: summarizeSteps(steps),
  };
}

async function callPlannerModel(request: PlannerRequest): Promise<RawPlannerResponse | null> {
  const providers = getLlmFallbackConfigs(request.images.length ? "vision" : "text");
  if (!providers.length) return null;

  const system = [
    "You are a production visual workflow planner.",
    "Return ONLY valid JSON. Do not execute tools.",
    "Plan by semantic intent, not by keyword matching.",
    "Use the provided tool catalog. If a tool is disabled, you may mention it but must not include it as an executable step.",
    "If critical information is missing, set needsClarification=true and ask one concise question.",
    "Respect user negative constraints strictly, such as 'do not make it Xiaohongshu/try-on/four-grid/video'.",
    "For commerce detail pages, do not make one dense full-page image when the user asks for multiple images/modules. Plan multiple commerce_detail_section steps, each with a different sectionTitle/sectionPurpose, then optionally a commerce_detail_stitch step for a long mobile image.",
    "For mobile commerce detail pages, set each section params.aspectRatio='9:16', layout='mobile', and avoid PC-like dense tables or tiny text.",
    "Prefer the minimum reliable number of steps.",
  ].join("\n");

  const text = [
    "Tool catalog:",
    JSON.stringify(getPlannerToolCatalog()),
    "",
    "Output schema:",
    JSON.stringify({
      intent: "string",
      summary: "string",
      confidence: "number 0-1",
      needsClarification: "boolean",
      clarificationQuestion: "string optional",
      imageRoles: [{ ref: "图1", imageIndex: 1, role: "person|clothing|product|background|style|source|reference|face|unknown", confidence: 0.8, reason: "string" }],
      userConstraints: ["string"],
      assumptions: ["string"],
      steps: [{
        id: "step_1",
        type: "text_to_image|image_to_image|tryon|face_swap|pose_variation|garment_3d|commerce_detail|commerce_detail_section|commerce_detail_stitch|commerce_creative|background_replace|select_image|image_quality_check|prompt_repair",
        title: "string",
        dependsOn: ["step_1"],
        input: {},
        params: {},
        expectedOutput: { imageUrls: true },
        riskNotes: ["string"],
      }],
    }),
    "",
    `Mode: ${request.mode}`,
    `Default model: ${request.defaults.model}`,
    `Default aspectRatio: ${request.defaults.aspectRatio}`,
    `Default imageSize: ${request.defaults.imageSize}`,
    `Default count: ${request.defaults.count}`,
    request.conversationSummary ? `Conversation summary: ${request.conversationSummary}` : "",
    request.activeWorkflowSummary ? `Active workflow: ${request.activeWorkflowSummary}` : "",
    request.userPreferences ? `User preferences: ${JSON.stringify(request.userPreferences)}` : "",
    `Images: ${request.images.map((img) => `图${img.index} role=${img.role || "auto"} file=${img.fileName || ""}`).join("; ") || "none"}`,
    `User request: ${request.userText}`,
  ].filter(Boolean).join("\n");

  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  for (const image of request.images.slice(0, 8)) {
    content.push({ type: "image_url", image_url: { url: image.url } });
  }

  for (const provider of providers) {
    const response = await fetch(getChatCompletionsUrl(provider), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });

    const bodyText = await response.text();
    if (!response.ok) continue;
    const data = JSON.parse(bodyText);
    const modelText = data?.choices?.[0]?.message?.content;
    if (typeof modelText !== "string") continue;
    const parsed = extractJson(modelText);
    if (parsed) return parsed as RawPlannerResponse;
  }

  return null;
}

function normalizePlannerOutput(raw: RawPlannerResponse, request: PlannerRequest): WorkflowPlan | null {
  if (raw.action === "chat") return buildClarificationPlan(raw.summary || "这是普通聊天请求，不需要创建工作流。");

  const rawSteps = Array.isArray(raw.steps)
    ? raw.steps.map((step, index) => normalizeStep(step, index)).filter((step): step is WorkflowStepPlan => Boolean(step))
    : [];

  const imageRoles = Array.isArray(raw.imageRoles)
    ? raw.imageRoles.map((role) => normalizeImageRole(role, request.images)).filter((role): role is ImageRoleResolution => Boolean(role))
    : inferImageRoles(request.images);
  const steps = normalizeCommerceDetailSteps(rawSteps, request, imageRoles);

  if (!raw.needsClarification && steps.length === 0) return null;

  return {
    intent: String(raw.intent || inferIntentFromSteps(steps) || "visual_workflow"),
    summary: String(raw.summary || request.userText || "视觉工作流"),
    confidence: clampConfidence(raw.confidence),
    needsClarification: Boolean(raw.needsClarification),
    clarificationQuestion: typeof raw.clarificationQuestion === "string" ? raw.clarificationQuestion : undefined,
    imageRoles,
    userConstraints: Array.isArray(raw.userConstraints) ? raw.userConstraints.map(String).slice(0, 8) : inferNegativeConstraints(request.userText),
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(String).slice(0, 8) : [],
    steps,
  };
}

function normalizeStep(value: unknown, index: number): WorkflowStepPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (!isPlannerToolType(type)) return null;
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `step_${index + 1}`,
    type,
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : getDefaultStepTitle(type),
    dependsOn: Array.isArray(record.dependsOn) ? record.dependsOn.map(String).filter(Boolean) : [],
    input: isRecord(record.input) ? record.input : {},
    params: isRecord(record.params) ? record.params : {},
    expectedOutput: isRecord(record.expectedOutput) ? record.expectedOutput : defaultOutputShape(type),
    riskNotes: Array.isArray(record.riskNotes) ? record.riskNotes.map(String).slice(0, 5) : [],
  };
}

function normalizeCommerceDetailSteps(
  steps: WorkflowStepPlan[],
  request: PlannerRequest,
  roles: ImageRoleResolution[]
) {
  if (!hasCommerceDetailIntent(request.userText)) return steps;
  const firstDetailIndex = steps.findIndex(isCommerceDetailStep);
  if (firstDetailIndex < 0) return steps;

  let lastDetailIndex = firstDetailIndex;
  for (let index = firstDetailIndex + 1; index < steps.length; index += 1) {
    if (isCommerceDetailStep(steps[index])) lastDetailIndex = index;
  }

  const before = steps.slice(0, firstDetailIndex);
  const detailSections = buildCommerceDetailSteps(request, roles, before.length);
  const after = steps.slice(lastDetailIndex + 1);
  return [...before, ...detailSections, ...after];
}

function isCommerceDetailStep(step: WorkflowStepPlan) {
  return step.type === "commerce_detail" || step.type === "commerce_detail_section" || step.type === "commerce_detail_stitch";
}

function buildFallbackPlan(request: PlannerRequest): WorkflowPlan {
  const text = request.userText;
  const roles = inferImageRoles(request.images);
  const steps: WorkflowStepPlan[] = [];
  const wantsVideo = /视频|短片|动起来|走秀|运镜|镜头运动/.test(text);
  const wants3d = /3d|3D|立体|悬浮|三维|商品展示/.test(text);
  const wantsTryon = /穿上|穿到|传到|转移到|套到|换到|换装|上身|试穿|把.*衣服.*(?:穿|传|转移|套|换)|(?:穿|传|转移|套|换).*衣服|衣服.*(?:穿|传|转移|套|换)|模特.*衣服/.test(text);
  const wantsFaceSwap = /换脸|替换脸|换五官|替换五官|人脸替换|face\s*swap/i.test(text);
  const wantsPose = /姿势|站姿|动作|四宫格|多几个.*姿|不同.*姿|pose/i.test(text);
  const wantsDetail = hasCommerceDetailIntent(text);
  const wantsCreative = /主图|banner|海报|活动图|推广图|封面/.test(text);
  const hasImages = request.images.length > 0;
  const tryonRefs = inferExplicitTryonRefs(text, request.images);

  if (wantsFaceSwap) {
    const faceRefs = inferExplicitFaceSwapRefs(text, request.images);
    steps.push({
      id: "step_1",
      type: "face_swap",
      title: "AI 换脸",
      dependsOn: [],
      input: {
        sourceImage: faceRefs.sourceImage || findImageRef(roles, ["person", "source", "reference"]) || "图1",
        faceImage: faceRefs.faceImage || findImageRef(roles, ["face"]) || (request.images.length > 1 ? "图2" : "图1"),
      },
      params: { prompt: text, count: request.defaults.count },
      expectedOutput: { imageUrls: true },
      riskNotes: ["只替换五官，必须保持原图肤色、发型、身体、服装和背景不变。"],
    });
  }

  if (wantsTryon) {
    steps.push({
      id: "step_1",
      type: "tryon",
      title: "人物换装",
      dependsOn: [],
      input: {
        personImage: tryonRefs.personImage || findImageRef(roles, ["person", "source", "reference"]) || "图1",
        clothingImage: tryonRefs.clothingImage || findImageRef(roles, ["clothing", "product"]) || (request.images.length > 1 ? "图2" : "图1"),
      },
      params: { prompt: text, count: 1 },
      expectedOutput: { imageUrls: true },
      riskNotes: ["需要检查人物身份和服装结构是否稳定。"],
    });
  }

  if (wantsPose) {
    const dependsOn = steps.length ? [steps[steps.length - 1].id] : [];
    steps.push({
      id: `step_${steps.length + 1}`,
      type: "pose_variation",
      title: "姿势裂变",
      dependsOn,
      input: { sourceImage: dependsOn.length ? `$${dependsOn[0]}.output.imageUrls[0]` : "图1" },
      params: { prompt: text, outputMode: /每个|单独|独立/.test(text) ? "separate" : "grid" },
      expectedOutput: { imageUrls: true },
      riskNotes: ["需要检查手指、关节、脸和身体比例。"],
    });
  }

  if (wants3d) {
    steps.push({
      id: `step_${steps.length + 1}`,
      type: "garment_3d",
      title: "服装 3D 展示",
      dependsOn: [],
      input: { garmentImage: findImageRef(roles, ["clothing", "product", "source"]) || "图1" },
      params: { prompt: text, count: request.defaults.count },
      expectedOutput: { imageUrls: true },
      riskNotes: ["复杂穿着图生成 3D 展示会有结构还原风险。"],
    });
  }

  if (wantsDetail || wantsCreative) {
    if (wantsDetail) {
      steps.push(...buildCommerceDetailSteps(request, roles, steps.length));
    } else {
    steps.push({
      id: `step_${steps.length + 1}`,
      type: wantsDetail ? "commerce_detail" : "commerce_creative",
      title: wantsDetail ? "电商详情页" : "电商视觉图",
      dependsOn: [],
      input: { referenceImages: hasImages ? request.images.map((img) => `图${img.index}`) : [] },
      params: { prompt: text, count: request.defaults.count },
      expectedOutput: { imageUrls: true },
      riskNotes: wantsDetail ? ["需要检查是否生成了详情页分区，而不是单张氛围图。"] : [],
    });
    }
  }

  if (!steps.length && /生成|制作|出图|设计|画|做一张|来一张|改图|重做|重新/.test(text)) {
    steps.push({
      id: "step_1",
      type: hasImages ? "image_to_image" : "text_to_image",
      title: hasImages ? "通用图生图" : "通用文生图",
      dependsOn: [],
      input: hasImages ? { sourceImages: request.images.map((img) => `图${img.index}`) } : {},
      params: { prompt: text, count: request.defaults.count },
      expectedOutput: { imageUrls: true },
      riskNotes: [],
    });
  }

  if (wantsVideo) {
    steps.push({
      id: `step_${steps.length + 1}`,
      type: "image_to_video",
      title: "图生视频（预留）",
      dependsOn: steps.length ? [steps[steps.length - 1].id] : [],
      input: { sourceImage: steps.length ? `$${steps[steps.length - 1].id}.output.imageUrls[0]` : "图1" },
      params: { motionPrompt: text },
      expectedOutput: { videoUrls: true },
      riskNotes: ["视频能力当前未开启，Validator 会阻断执行。"],
    });
  }

  if (!steps.length) {
    return buildClarificationPlan("我可以先聊天分析，也可以创建生图工作流。请补充你希望生成或修改什么。");
  }

  return {
    intent: inferIntentFromSteps(steps) || "visual_workflow",
    summary: summarizeSteps(steps),
    confidence: 0.68,
    needsClarification: false,
    imageRoles: roles,
    userConstraints: inferNegativeConstraints(text),
    assumptions: ["这是本地兜底规划，确认前请检查图片角色和步骤。"],
    steps,
  };
}

function buildCommerceDetailSteps(
  request: PlannerRequest,
  roles: ImageRoleResolution[],
  startIndex: number
): WorkflowStepPlan[] {
  const text = request.userText;
  const sectionCount = inferCommerceSectionCount(text, request.defaults.count);
  const platform = inferCommercePlatform(text);
  const outputMode = inferCommerceOutputMode(text);
  const layout = inferCommerceLayout(text, platform);
  const mobileWidth = inferMobileWidth(text, platform);
  const aspectRatio = layout === "desktop" ? "16:9" : "9:16";
  const references = request.images.length ? request.images.map((img) => `图${img.index}`) : [];
  const sections = getCommerceSectionBlueprints(sectionCount, platform);
  const steps: WorkflowStepPlan[] = sections.map((section, index) => {
    const id = `step_${startIndex + index + 1}`;
    return {
      id,
      type: "commerce_detail_section",
      title: section.title,
      dependsOn: [],
      input: { referenceImages: references },
      params: {
        prompt: text,
        platform,
        layout,
        mobileWidth,
        aspectRatio,
        imageSize: request.defaults.imageSize,
        sectionIndex: index + 1,
        sectionTotal: sectionCount,
        sectionTitle: section.title,
        sectionPurpose: section.purpose,
        moduleMode: "single_distinct_section",
        count: 1,
      },
      expectedOutput: { imageUrls: true },
      riskNotes: ["多张详情页图表示多个不同模块；每一步只生成当前模块，不要生成完整详情页或重复模块。"],
    };
  });

  if (outputMode !== "sections") {
    const stitchId = `step_${startIndex + steps.length + 1}`;
    steps.push({
      id: stitchId,
      type: "commerce_detail_stitch",
      title: layout === "desktop" ? "整理详情页模块预览" : "拼接手机详情长图",
      dependsOn: steps.map((step) => step.id),
      input: { imageUrls: steps.map((step) => `$${step.id}.output.imageUrls[0]`) },
      params: {
        platform,
        layout,
        mobileWidth,
        width: mobileWidth,
        gap: 0,
        sectionHeight: layout === "desktop" ? 900 : platform === "xiaohongshu" ? 1200 : 1320,
        outputMode,
      },
      expectedOutput: { imageUrls: true },
      riskNotes: [],
    });
  }

  return steps;
}

function hasCommerceDetailIntent(text: string) {
  const hasDetailSignal =
    /详情页|商品详情|详情长图|长图|卖点图|参数图|功能图|尺码图|规格图|材质图|淘宝|天猫|京东|拼多多|PDD|pdd|抖音|小红书|独立站|shopify|官网/i.test(text);
  const isOnlyCreativeAsset = /主图|banner|海报|封面|活动图|推广图/.test(text) && !/详情页|商品详情|长图|板块|版块|拼接/.test(text);
  return hasDetailSignal && !isOnlyCreativeAsset;
}

function inferCommerceSectionCount(text: string, defaultCount: number) {
  const explicit = text.match(/(\d+)\s*(?:张|个|屏|段|页|版块|板块|section|sections)/i);
  const count = explicit ? Number(explicit[1]) : Number(defaultCount || 4);
  if (!Number.isFinite(count)) return 4;
  return Math.min(Math.max(Math.floor(count), 1), 8);
}

function inferCommercePlatform(text: string) {
  if (/拼多多|PDD|pinduoduo/i.test(text)) return "pdd";
  if (/抖音|douyin|tiktok/i.test(text)) return "douyin";
  if (/小红书|xiaohongshu|rednote|red book/i.test(text)) return "xiaohongshu";
  if (/京东|JD|jingdong/i.test(text)) return "jd";
  if (/天猫|tmall/i.test(text)) return "tmall";
  if (/淘宝|taobao/i.test(text)) return "taobao";
  if (/独立站|shopify|官网|independent/i.test(text)) return "independent";
  return "general";
}

function inferCommerceOutputMode(text: string): "sections" | "stitched" | "both" {
  if (/只要.*(?:独立|分开)|不要.*(?:长图|拼接)|独立图|分开给/i.test(text)) return "sections";
  if (/同时|都要|独立.*长图|长图.*独立/i.test(text)) return "both";
  return /长图|拼接|详情页/i.test(text) ? "both" : "sections";
}

function inferCommerceLayout(text: string, platform: string): "mobile" | "desktop" {
  if (/PC|pc|电脑|桌面端|横版|宽屏|官网首屏|web/i.test(text) && !/手机|移动端|竖版|长图/.test(text)) return "desktop";
  if (/手机|移动端|竖版|长图|详情页|淘宝|天猫|拼多多|PDD|抖音|小红书/i.test(text)) return "mobile";
  if (platform === "independent" && /官网|web|PC|pc|电脑|桌面端/i.test(text)) return "desktop";
  return "mobile";
}

function inferMobileWidth(text: string, platform: string) {
  const explicit = text.match(/(?:宽度|width)\s*[:：]?\s*(\d{3,4})/i);
  if (explicit) return Math.min(Math.max(Number(explicit[1]), 320), 1440);
  if (platform === "xiaohongshu" || platform === "douyin") return 1080;
  return 750;
}

function getCommerceSectionBlueprints(count: number, platform: string) {
  const base = [
    { title: "首屏主视觉", purpose: "商品完整展示、核心标题和第一卖点" },
    { title: "核心卖点", purpose: "把最重要的购买理由做成清晰可扫读的视觉层级" },
    { title: "材质细节", purpose: "展示面料、纹理、工艺、版型和触感信息" },
    { title: "场景搭配", purpose: "展示穿搭、使用场景、风格氛围或人群定位" },
    { title: "功能参数", purpose: "尺码、规格、功能、护理或商品参数" },
    { title: "对比证明", purpose: "优势对比、痛点解决、真实细节证明" },
    { title: "信任背书", purpose: "品质、服务、保障、物流或品牌可信度" },
    { title: "收尾转化", purpose: "购买理由总结、搭配建议和行动引导" },
  ];
  if (platform === "xiaohongshu" || platform === "douyin") {
    base[1] = { title: "种草亮点", purpose: "内容平台语气的真实使用价值和视觉记忆点" };
    base[3] = { title: "生活方式场景", purpose: "更像内容种草的自然场景和氛围展示" };
  }
  if (platform === "pdd") {
    base[1] = { title: "价格与利益点", purpose: "直接、强识别的利益点和购买理由" };
  }
  return base.slice(0, count);
}

function shouldPreferFallbackPlan(normalized: WorkflowPlan, fallback: WorkflowPlan, request: PlannerRequest) {
  if (!fallback.steps.length) return false;
  const strongWorkflow = isStrongWorkflowRequest(request.userText, request.images.length);
  if (strongWorkflow && normalized.needsClarification && normalized.steps.length === 0) return true;
  const fallbackTypes = new Set(fallback.steps.map((step) => step.type));
  const normalizedTypes = new Set(normalized.steps.map((step) => step.type));
  if (strongWorkflow && fallback.steps.length > normalized.steps.length) return true;
  if (fallbackTypes.has("tryon") && !normalizedTypes.has("tryon")) return true;
  if (fallbackTypes.has("pose_variation") && /每张|单独|独立|不同姿势|姿势/.test(request.userText) && !normalizedTypes.has("pose_variation")) return true;
  if (fallbackTypes.has("commerce_detail_section") && !normalizedTypes.has("commerce_detail_section")) return true;
  return false;
}

function findPreviousVisualProducer(steps: WorkflowStepPlan[], beforeIndex: number) {
  const producerTypes = new Set<WorkflowToolType>([
    "text_to_image",
    "image_to_image",
    "tryon",
    "face_swap",
    "pose_variation",
    "garment_3d",
    "commerce_creative",
    "background_replace",
  ]);

  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (producerTypes.has(step.type) && step.expectedOutput?.imageUrls) return step;
  }
  return null;
}

function getStepOutputImageRefs(step: WorkflowStepPlan) {
  const outputMode = typeof step.params.outputMode === "string" ? step.params.outputMode : "";
  const rawCount = Number(step.params.count || step.params.genCount || (outputMode === "separate" ? 4 : 1));
  const count = Math.min(Math.max(Number.isFinite(rawCount) ? Math.floor(rawCount) : 1, 1), 8);
  return Array.from({ length: count }, (_, index) => `$${step.id}.output.imageUrls[${index}]`);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isStrongWorkflowRequest(text: string, imageCount: number) {
  if (imageCount > 0 && /然后|再|接着|最后|先.*再|从.*选|工作流|分步/.test(text)) return true;
  if (/图\d+.*(?:穿|传|转移|套|换).*图\d+|图\d+.*人物.*图\d+.*衣服|图\d+.*衣服.*图\d+.*(?:人物|模特|人)/.test(text)) return true;
  if (/每张.*单独|独立出图|不同姿势|四个.*姿势|4个.*姿势/.test(text)) return true;
  return false;
}

function inferExplicitTryonRefs(text: string, images: WorkflowInputImage[]) {
  const hasImage = (index: number) => images.some((image) => image.index === index);
  const patterns = [
    /图\s*(\d+)\s*(?:的)?(?:人物|模特|人)\s*(?:穿|换上|穿上|上身)\s*图\s*(\d+)\s*(?:的)?(?:衣服|服装|裙子|上衣|裤子|外套)?/,
    /图\s*(\d+)\s*(?:的)?(?:衣服|服装|裙子|上衣|裤子|外套)\s*(?:穿到|穿在|给|传到|转移到|套到|换到)\s*图\s*(\d+)\s*(?:的)?(?:人物|模特|人)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (!hasImage(first) || !hasImage(second)) continue;
    if (pattern === patterns[1]) {
      return { personImage: `图${second}`, clothingImage: `图${first}` };
    }
    return { personImage: `图${first}`, clothingImage: `图${second}` };
  }
  return { personImage: null, clothingImage: null };
}

function inferExplicitFaceSwapRefs(text: string, images: WorkflowInputImage[]) {
  const hasImage = (index: number) => images.some((image) => image.index === index);
  const patterns = [
    /(?:把|将)?\s*图\s*(\d+).*?(?:脸|五官|面部).*?(?:换到|替换到|放到|融合到|应用到|给到).*?图\s*(\d+)/,
    /图\s*(\d+).*?(?:换脸|替换脸|换五官).*?图\s*(\d+)/,
    /图\s*(\d+).*?(?:作为|当作).*?(?:目标脸|脸图|face).*?图\s*(\d+).*?(?:作为|当作).*?(?:原图|模特图|source)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (!hasImage(first) || !hasImage(second)) continue;
    if (pattern === patterns[0]) return { faceImage: `图${first}`, sourceImage: `图${second}` };
    if (pattern === patterns[2]) return { faceImage: `图${first}`, sourceImage: `图${second}` };
    return { sourceImage: `图${first}`, faceImage: `图${second}` };
  }
  return { sourceImage: null, faceImage: null };
}

function inferImageRoles(images: WorkflowInputImage[]): ImageRoleResolution[] {
  return images.map((image, index) => ({
    ref: `图${image.index}`,
    imageIndex: image.index,
    role: normalizeInputRole(image.role, index),
    confidence: image.role && image.role !== "auto" ? 0.9 : 0.55,
    reason: image.role && image.role !== "auto" ? "用户已设置图片角色" : "按图片顺序自动推测",
  }));
}

function normalizeInputRole(role: WorkflowInputImage["role"], index: number): ImageRoleResolution["role"] {
  if (role === "clothing") return "clothing";
  if (role === "face") return "face";
  if (role === "background") return "background";
  if (role === "source") return "source";
  if (role === "reference") return "reference";
  if (role === "person" || role === "product" || role === "style") return role;
  return index === 0 ? "source" : "reference";
}

function normalizeImageRole(value: unknown, images: WorkflowInputImage[]): ImageRoleResolution | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const imageIndex = Number(record.imageIndex || String(record.ref || "").match(/\d+/)?.[0]);
  if (!Number.isFinite(imageIndex) || !images.some((img) => img.index === imageIndex)) return null;
  const role = typeof record.role === "string" ? record.role : "unknown";
  return {
    ref: typeof record.ref === "string" ? record.ref : `图${imageIndex}`,
    imageIndex,
    role: isImageRole(role) ? role : "unknown",
    confidence: clampConfidence(record.confidence),
    reason: typeof record.reason === "string" ? record.reason : undefined,
  };
}

function findImageRef(roles: ImageRoleResolution[], candidates: ImageRoleResolution["role"][]) {
  return roles.find((role) => candidates.includes(role.role))?.ref || null;
}

function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.trim());
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function buildClarificationPlan(message: string): WorkflowPlan {
  return {
    intent: "clarification",
    summary: message,
    confidence: 0.5,
    needsClarification: true,
    clarificationQuestion: message,
    imageRoles: [],
    userConstraints: [],
    assumptions: [],
    steps: [],
  };
}

function inferNegativeConstraints(text: string): string[] {
  const constraints: string[] = [];
  if (/不要|别|不做|不是|无需|避免/.test(text)) constraints.push(text.slice(0, 160));
  return constraints;
}

function inferIntentFromSteps(steps: WorkflowStepPlan[]) {
  if (!steps.length) return null;
  if (steps.length > 1) return "multi_step_visual_workflow";
  return steps[0].type;
}

function summarizeSteps(steps: WorkflowStepPlan[]) {
  return steps.map((step, index) => `${index + 1}. ${step.title}`).join(" -> ");
}

function defaultOutputShape(type: WorkflowToolType): WorkflowStepOutputShape {
  if (type === "select_image") return { selectedImageUrl: true };
  if (type === "image_to_video") return { videoUrls: true };
  if (type === "prompt_repair" || type === "image_quality_check") return { text: true };
  return { imageUrls: true };
}

function getDefaultStepTitle(type: WorkflowToolType) {
  return type.replace(/_/g, " ");
}

function isPlannerToolType(value: string): value is WorkflowToolType {
  return [
    "text_to_image",
    "image_to_image",
    "tryon",
    "face_swap",
    "pose_variation",
    "garment_3d",
    "commerce_detail",
    "commerce_detail_section",
    "commerce_detail_stitch",
    "commerce_creative",
    "background_replace",
    "select_image",
    "image_quality_check",
    "prompt_repair",
    "image_to_video",
    "image_to_3d_asset",
  ].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImageRole(value: string): value is ImageRoleResolution["role"] {
  return ["auto", "person", "clothing", "product", "background", "style", "source", "reference", "face", "unknown"].includes(value);
}

function clampConfidence(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0.7;
  return Math.max(0, Math.min(1, num));
}
