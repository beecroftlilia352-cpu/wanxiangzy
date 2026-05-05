/**
 * POST /api/agent/chat
 * 统一 Agent API：LLM 理解意图 → 自动路由到生图模块 → 返回结果
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmFallbackConfigs } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob } from "@/lib/api/generation-jobs";
import {
  getCreditCost,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  applyImageRoleParams,
  buildPlanLines,
  getImageRoleLabel,
  normalizeAgentModule,
  resolveImageUrl,
  resolveImageUrls,
  validateAgentDecision,
  validateImageRoleConflicts,
  type AgentImageInput,
} from "@/lib/agent/decision-utils";
import { buildSafeReplyExcerpt } from "@/lib/agent/formatting";
import type { AgentIntentMode } from "@/lib/agent/types";

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是 VastWear AI 助手，一个专业的服装电商视觉 AI 智能体。你精通服装摄影、电商视觉、AI 图像生成。

## 你的能力

1. **文生图**：用户描述想要的画面，你直接生成（不需要上传图片）
2. **图生图**：根据用户上传的图片，重新生成类似风格的图片
3. **图片分析**：识别服装品类、颜色、面料、风格、适用场景
4. **视觉建议**：推荐拍摄风格、构图、配色、场景搭配
5. **专项生图**：换装/种草/3D/换背景/姿势裂变/专属模特
6. **专业对话**：回答服装、电商、摄影相关问题

## 重要：主动推荐能力

- 用户上传图片后，主动分析并推荐可执行的操作（图生图/分析/换装等）
- 用户描述画面时，主动提示可以用文生图生成
- 不要等用户明确说"生成"，主动建议："需要我帮你生成吗？"

## 回复规则

你的回复必须是严格的 JSON 格式，不要输出任何其他内容：

\`\`\`json
{
  "reply": "你的详细回复（中文，支持Markdown格式，要专业、详细、有深度，至少3-5句话）",
  "action": "chat 或 generate",
  "module": "模块名或null",
  "params": {},
  "style": null,
  "confidence": 0.0,
  "missing_fields": []
}
\`\`\`

### reply 字段要求
- 必须详细、专业、有深度（至少3句话，最好5-10句话）
- 分析图片时要具体：品类、颜色、面料、风格、适合场景、拍摄建议
- 用 Markdown 格式：**粗体**、二级标题、短段落、\`-\` 列表
- 列表必须每项独占一行，列表前后必须空一行；禁止把多个 \`•\` 或多个列表项挤在同一行
- 回复结构优先使用：一句结论 → \`**我能帮你做什么**\` → 列表 → \`**建议下一步**\`
- 像一个资深的电商视觉顾问在给客户做方案

### action 字段规则
- 用户要求生成/制作/出图，且有图片 → "generate"
- 用户要求修改/调整/重做/换掉某部分，且有图片 → "generate"（修改后重新生成）
- 用户描述服装组合（上装+下装+模特），且有图片 → "generate"
- 用户只是聊天/提问/分析/咨询 → "chat"
- 有图片但意图不确定、图片角色不清、缺少关键图片 → "chat"，先追问或给建议，不要误触发扣积分生成
- 只有当用户明确要生成/换装/种草/换背景/3D/姿势裂变，或图片角色足够明确时，才返回 "generate"

### module 字段（仅 action="generate" 时）
- "tryon"：换装/穿上/试穿/上身
- "grass"：种草/小红书/街拍/生活感
- "garment_3d"：3D/立体/商品展示
- "model"：专属模特/建模特/定制脸
- "model_background"：换背景/换场景/换模特
- "pose"：四宫格/姿势裂变

### params 字段
用图号引用图片（图1、图2...），例如：
- 换装：{"clothing_urls": ["图1"], "reference_url": "图2"}
- 种草：{"garment_url": "图1"}
- 3D：{"garment_url": "图1"}
- 专属模特：{"reference_urls": ["图1", "图2"]}
- 换背景：{"source_url": "图1", "background_reference_url": "图2"}
- 姿势裂变：{"main_image_url": "图1"}

### 示例

用户上传了2张图说："帮我把图1穿到图2身上，韩系风格"
{
  "reply": "好的！我来帮你生成韩系风格的换装效果图。\n\n• **服装**：图1的碎花连衣裙\n• **参考**：图2的模特姿势\n• **风格**：韩系清透\n\n正在调用换装模块，请稍候...",
  "action": "generate",
  "module": "tryon",
  "params": {"clothing_urls": ["图1"], "reference_url": "图2"},
  "style": "韩系清透"
}

用户说："这件衣服适合什么场景？"（有图片）
{
  "reply": "这件碎花连衣裙非常适合以下场景：\n\n• **春夏日常**：轻盈面料和碎花图案自带清新感\n• **咖啡店/花店**：和花朵元素搭配，氛围感很强\n• **小红书种草**：碎花裙是小红书高热度品类\n\n建议拍摄风格：韩系清透或日系小清新，自然光线为佳。",
  "action": "chat",
  "module": null,
  "params": {},
  "style": null
}`;

const MODULE_API: Record<string, string> = {
  tryon: "/api/tryon",
  grass: "/api/grass",
  model: "/api/model",
  model_background: "/api/model-background",
  pose: "/api/pose",
  garment_3d: "/api/garment-3d",
};

const MODULE_LABELS: Record<string, string> = {
  tryon: "服装上身",
  grass: "种草图",
  model: "专属模特",
  model_background: "换背景",
  pose: "姿势裂变",
  garment_3d: "3D展示",
};

type AgentDecision = {
  reply: string;
  action: "chat" | "generate";
  module: string | null;
  params: Record<string, unknown>;
  style: string | null;
  confidence: number;
  missingFields: string[];
  source: "llm" | "heuristic" | "fallback";
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { message, images, history, intentMode: rawIntentMode, params: userParams } = body as {
      message?: string;
      images?: AgentImageInput[];
      history?: Array<{ role: string; content: string }>;
      intentMode?: AgentIntentMode;
      params?: { model?: string; aspectRatio?: string; imageSize?: string; count?: number };
    };
    const intentMode = normalizeIntentMode(rawIntentMode);

    if (!message?.trim() && (!images || images.length === 0)) {
      return NextResponse.json({ reply: "请输入消息或上传图片。", action: "chat" });
    }

    const hasImages = images && images.length > 0;
    const providers = getLlmFallbackConfigs(hasImages ? "vision" : "text");

    if (providers.length === 0) {
      return NextResponse.json({ reply: "AI 服务暂时不可用。", action: "chat" });
    }

    // 构建 LLM 消息
    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (history) {
      for (const msg of history.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const userContent: Array<Record<string, unknown>> = [];
    const userText = (message || "").trim();
    const modeInstruction = getIntentModeInstruction(intentMode);
    const imageDesc = hasImages
      ? `\n\n图片编号：${images!.map((img) => `图${img.index}（${getImageRoleLabel(img.role) || guessImageRole(img.index, images!.length, userText)}）`).join("、")}\n图片角色以括号标注为准，优先使用用户设置的图片角色，不要自行交换图号。`
      : "";
    userContent.push({ type: "text", text: `${modeInstruction}\n\n${userText || "请分析这些图片并推荐操作"}${imageDesc}` });

    if (hasImages) {
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    }
    messages.push({ role: "user", content: userContent });

    // 调用 LLM（带降级）
    let llmContent = "";
    for (const provider of providers) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 40000);
        const res = await fetch(getChatCompletionsUrl(provider), {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: provider.model, messages, max_tokens: 1200, temperature: 0.4 }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (res.ok) {
          const data = await res.json();
          llmContent = extractText(data).trim();
          if (llmContent) break;
          console.warn("[agent-chat] provider returned empty content", {
            provider: provider.provider,
            model: provider.model,
          });
        } else {
          const errorText = await res.text().catch(() => "");
          console.warn("[agent-chat] provider failed", {
            provider: provider.provider,
            model: provider.model,
            status: res.status,
            body: errorText.slice(0, 300),
          });
        }
      } catch (err) {
        console.warn("[agent-chat] provider request error", {
          provider: provider.provider,
          model: provider.model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!llmContent) {
      return NextResponse.json({
        reply: "AI 对话服务没有返回有效内容，请稍后重试，或先检查当前 LLM Provider 的 API Key。",
        action: "chat",
      });
    }

    // 解析 LLM 响应
    const parsed = extractJson(llmContent);
    const decision = normalizeAgentDecision(parsed, llmContent, userText, Boolean(hasImages), images?.length || 0);
    let { action, module } = decision;
    let llmParams = decision.params;
    const style = decision.style;
    const standaloneTextGeneration = isStandaloneTextGenerationIntent(userText);
    const commerceDesign = isCommerceDesignIntent(userText);

    if (intentMode === "chat" || isChatOnlyIntent(userText)) {
      action = "chat";
      module = null;
      decision.source = decision.source === "llm" ? "llm" : "heuristic";
    } else if (commerceDesign || standaloneTextGeneration) {
      action = "generate";
      module = "general";
      llmParams = { ...llmParams, prompt: buildGeneralGenerationPrompt(userText, commerceDesign) };
      decision.params = llmParams;
      decision.confidence = Math.max(decision.confidence, 0.82);
      decision.source = "heuristic";
    }

    // 兜底：检测生图意图
    if (intentMode !== "chat" && !module) {
      const detected = detectGenerationIntent(userText);
      if (detected) {
        action = "generate";
        module = detected;
        decision.confidence = Math.max(decision.confidence, 0.72);
        decision.source = "heuristic";
      }
      // 最终兜底：多图 + 非纯聊天时才默认换装；单图更适合先分析/询问，避免误扣积分
      if (!module && intentMode === "create" && hasImages && (images?.length || 0) >= 2 && !isChatOnlyIntent(userText)) {
        action = "generate";
        module = "tryon";
        decision.confidence = 0.55;
        decision.source = "fallback";
      }
    }

    if (module && hasImages) {
      llmParams = applyImageRoleParams(module, llmParams, images || []);
      decision.params = llmParams;
    }

    // 最终决策日志
    console.log("[agent-chat] decision:", {
      action,
      module,
      confidence: decision.confidence,
      source: decision.source,
      hasImages,
      userText: userText.slice(0, 50),
    });

    // 对话模式：直接返回
    if (action !== "generate" || !module) {
      return NextResponse.json({ reply: decision.reply, action: "chat" });
    }

    // 通用生图（文生图 / 图生图 / 无特定模块）
    if (!MODULE_API[module]) {
      const imageUrls = standaloneTextGeneration ? [] : (images || []).map((img) => img.url).filter(Boolean);
      const generalPrompt = buildGeneralGenerationPrompt(
        typeof decision.params.prompt === "string" ? decision.params.prompt : userText,
        commerceDesign
      );
      const generalLabel = commerceDesign ? "电商详情页" : "通用生图";
      const model = normalizeLingyaModel(userParams?.model);
      const aspectRatio = normalizeAspectRatio(userParams?.aspectRatio || "3:4");
      const imageSize = normalizeImageSize(model, (userParams?.imageSize as ImageSize) || "1K", aspectRatio);
      const count = Math.min(Math.max(Number(userParams?.count) || 1, 1), 4);
      const cost = getCreditCost(model, imageSize, aspectRatio) * count;
      return NextResponse.json({
        reply: buildConfirmReply(generalLabel, decision.reply, {
          imageCount: imageUrls.length,
          confidence: decision.confidence,
          missingFields: [],
          planLines: buildPlanLines("general", decision.params, images || []),
        }),
        action: "confirm_generate",
        module: "general",
        module_label: generalLabel,
        generation_params: {
          prompt: generalPrompt,
          images: imageUrls,
          model,
          aspectRatio,
          imageSize,
          count,
        },
        api_path: "/api/agent/generate",
        credits_cost: cost,
      });
    }

    // ===== 生图模式 =====
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ reply: "请先登录。", action: "chat" });

    const model: LingyaModel = normalizeLingyaModel(userParams?.model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(userParams?.aspectRatio || "3:4");
    const imageSize: ImageSize = normalizeImageSize(model, (userParams?.imageSize as ImageSize) || "1K", aspectRatio);
    const count = Math.min(Math.max(Number(userParams?.count) || 1, 1), 4);
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);
    const totalCost = costPerImage * count;

    // 构建图片映射：图号 → URL
    const imageMap = new Map<number, string>();
    for (const img of images!) imageMap.set(img.index, img.url);
    const validation = validateAgentDecision(module, llmParams, imageMap);
    if (!validation.ok) {
      return NextResponse.json({
        reply: buildClarifyReply(module, validation.missingFields, imageMap.size),
        action: "chat",
        missing_fields: validation.missingFields,
        confidence: decision.confidence,
      });
    }
    const roleValidation = validateImageRoleConflicts(module, llmParams, images || []);
    if (!roleValidation.ok) {
      return NextResponse.json({
        reply: buildRoleConflictReply(module, roleValidation.issues, images || []),
        action: "chat",
        missing_fields: roleValidation.issues,
        confidence: decision.confidence,
      });
    }

    // 构建模块参数
    const moduleParams = buildModuleParams(module, llmParams, imageMap, {
      model, aspectRatio, imageSize, count, style,
    });


    if (!moduleParams) {
      console.error("[agent-chat] buildModuleParams failed", { module, llmParams, imageMapKeys: Array.from(imageMap.keys()) });
      return NextResponse.json({
        reply: `${decision.reply}\n\n参数构建失败，请尝试更明确地描述，例如：“把图1的衣服穿到图2身上”。`,
        action: "chat",
      });
    }

    // 不直接执行，返回确认信息让用户确认后才扣积分
    return NextResponse.json({
      reply: buildConfirmReply(MODULE_LABELS[module] || module, decision.reply, {
        imageCount: imageMap.size,
        confidence: decision.confidence,
        missingFields: [],
        planLines: buildPlanLines(module, llmParams, images || []),
      }),
      action: "confirm_generate",
      module,
      module_label: MODULE_LABELS[module] || module,
      generation_params: moduleParams,
      job_payload: buildJobPayload(module, moduleParams, { model, aspectRatio, imageSize, count }),
      credits_cost: totalCost,
      api_path: MODULE_API[module],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === "AbortError" ? "AI 响应超时，请重试。" : "处理出错。";
    return NextResponse.json({ reply: msg, action: "chat" });
  }
}

// ---- 工具函数 ----

function guessImageRole(index: number, total: number, message: string): string {
  if (total === 1) return "服装图";
  if (/模特|人脸|脸/.test(message)) {
    if (index === 1) return "服装图";
    return "模特参考图";
  }
  if (/背景|场景/.test(message)) {
    if (index === 1) return "原图";
    return "背景参考图";
  }
  if (index === 1) return "服装图";
  if (index === 2) return "参考图";
  return `图${index}`;
}

function normalizeAgentDecision(
  parsed: Record<string, unknown> | null,
  rawText: string,
  userText: string,
  hasImages: boolean,
  imageCount: number
): AgentDecision {
  const parsedReply = typeof parsed?.reply === "string" && parsed.reply.trim().length > 10 ? parsed.reply : "";
  const reply = normalizeAgentReply(parsedReply || rawText || getDefaultAgentReply(userText, hasImages));
  const rawAction = typeof parsed?.action === "string" ? parsed.action : "";
  const rawModule = typeof parsed?.module === "string" ? parsed.module : null;
  let action: AgentDecision["action"] = rawAction === "generate" ? "generate" : "chat";
  let module = normalizeAgentModule(rawModule);

  const params = parsed?.params && typeof parsed.params === "object"
    ? parsed.params as Record<string, unknown>
    : {};
  const style = typeof parsed?.style === "string" && parsed.style.trim() && parsed.style !== "null"
    ? parsed.style.trim()
    : null;
  const parsedConfidence = typeof parsed?.confidence === "number" ? parsed.confidence : null;
  const missingFields = Array.isArray(parsed?.missing_fields)
    ? parsed.missing_fields.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const detected = detectGenerationIntent(userText);
  if (isCommerceDesignIntent(userText)) {
    action = "generate";
    module = "general";
    params.prompt = buildGeneralGenerationPrompt(userText, true);
  } else if (action === "chat" && detected && !isChatOnlyIntent(userText)) {
    action = "generate";
    module = detected;
  }
  if (!module && detected) module = detected;

  if (action === "generate" && !hasImages && module !== "general") {
    module = "general";
  }

  const hasExplicitGenerate = /生成|制作|出图|做一张|来一张|画一张|换装|上身|种草|换背景|3[dD]|四宫格|姿势/.test(userText);
  let confidence = parsedConfidence !== null ? parsedConfidence : parsed ? 0.82 : 0.58;
  if (confidence > 1) confidence = confidence / 100;
  if (!parsed) confidence -= 0.12;
  if (hasExplicitGenerate) confidence += 0.08;
  if (action === "generate" && hasImages) confidence += Math.min(imageCount, 3) * 0.03;
  if (module === "general" && hasImages) confidence -= 0.1;
  confidence = Math.max(0.25, Math.min(0.95, confidence));

  return {
    reply,
    action,
    module,
    params,
    style,
    confidence,
    missingFields,
    source: parsed ? "llm" : "fallback",
  };
}

function getDefaultAgentReply(userText: string, hasImages: boolean): string {
  if (hasImages) {
    return "我已收到图片，会先确认图片关系和你的目标，再决定是否进入生成流程。";
  }
  if (/生成|制作|出图|画/.test(userText)) {
    return "可以，我会按你的描述整理成适合生成的画面方案，并在确认后开始生成。";
  }
  return "我在，可以帮你分析服装图片、整理生成方案，或把需求转成可执行的视觉任务。";
}

function buildClarifyReply(module: string, missingFields: string[], imageCount: number): string {
  const label = MODULE_LABELS[module] || module;
  const missing = missingFields.join("、") || "必要图片";
  const uploaded = imageCount > 0 ? `当前已识别到 ${imageCount} 张图片，但还需要你明确图片关系。` : "当前还没有可用图片。";
  return normalizeAgentReply(
    `我可以继续做 **${label}**，但还缺少 **${missing}**。\n\n${uploaded}\n\n**请补充一句更明确的指令**\n\n- 服装上身：把图1的衣服穿到图2的人身上\n- 种草图：用图1服装生成小红书街拍种草图\n- 换背景：把图1背景换成图2的场景\n\n确认图片关系后，我再给你生成确认卡片，避免误扣积分。`
  );
}

function buildRoleConflictReply(module: string, issues: string[], images: AgentImageInput[]): string {
  const label = MODULE_LABELS[module] || module;
  const roleLines = images
    .filter((img) => img.role && img.role !== "auto")
    .map((img) => `- 图${img.index}：${getImageRoleLabel(img.role) || "自动"}`);
  const roleSummary = roleLines.length
    ? `\n\n**当前图片角色**\n\n${roleLines.join("\n")}`
    : "";

  return normalizeAgentReply(
    `我先暂停 **${label}**，因为图片角色和本次任务有冲突，直接生成容易用错图。\n\n**需要确认的问题**\n\n${issues.map((issue) => `- ${issue}`).join("\n")}${roleSummary}\n\n**建议下一步**\n\n请在图片缩略图上调整角色，或直接说明：“图1是服装，图2是参考图，图3是模特脸”。确认后我再生成确认卡，避免误扣积分。`
  );
}

function buildConfirmReply(
  moduleLabel: string,
  originalReply: string,
  meta: { imageCount: number; confidence: number; missingFields: string[]; planLines?: string[] }
): string {
  const confidenceLabel = meta.confidence >= 0.8 ? "高" : meta.confidence >= 0.62 ? "中" : "偏低";
  const intro = buildSafeReplyExcerpt(originalReply, 220);
  const contextLine = meta.imageCount > 0
    ? `我会只使用本次附件区里的 ${meta.imageCount} 张图，不会自动带入历史会话图片。`
    : "我会按纯文字生成，不使用任何历史图片或旧附件。";

  const plan = meta.planLines?.length
    ? `\n\n**图片关系**\n\n${meta.planLines.map((line) => `- ${line}`).join("\n")}`
    : "";

  return normalizeAgentReply(
    `${intro}\n\n**我的理解**\n\n- **任务类型**：${moduleLabel}\n- **上下文边界**：${contextLine}\n- **理解置信度**：${confidenceLabel}${plan}\n\n**扣费说明**\n\n确认卡只是预检，不会扣积分。确认无误后点击“确认生成”，系统才会扣除积分并开始任务。`
  );
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  return typeof msg?.content === "string" ? msg.content : "";
}

function normalizeAgentReply(text: string): string {
  const jsonLike = extractJson(text);
  let output = typeof jsonLike?.reply === "string" ? jsonLike.reply.trim() : text.trim();

  output = output
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s+•\s+/g, "$1\n- ")
    .replace(/^\s*•\s+/gm, "- ")
    .replace(/([。！？])\s+(?=\*\*[^*\n]+?\*\*)/g, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n");

  output = output
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^[*-]\s+/.test(trimmed)) return trimmed.replace(/^\*\s+/, "- ");
      return line;
    })
    .join("\n")
    .replace(/([^\n])\n(-\s+)/g, "$1\n\n$2")
    .replace(/(-\s+[^\n]+)\n([^-\n\s][^\n]*)/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return output;
}

function extractJson(text: string): Record<string, unknown> | null {
  const clean = text.trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const balanced = findBalancedJsonObject(fenced?.[1] || clean);
  const strategies = [
    () => JSON.parse(clean),
    () => fenced ? JSON.parse(fenced[1]) : null,
    () => balanced ? JSON.parse(balanced) : null,
  ];
  for (const fn of strategies) {
    try {
      const r = fn();
      if (r && typeof r === "object" && "reply" in r) return r;
    } catch {}
  }
  return extractLooseAgentJson(balanced || clean);
}

function findBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractLooseAgentJson(text: string): Record<string, unknown> | null {
  const reply = matchLooseStringField(text, "reply");
  if (!reply) return null;

  const action = matchLooseStringField(text, "action") || "chat";
  const moduleValue = matchLooseStringField(text, "module");
  const style = matchLooseStringField(text, "style");
  const confidence = matchLooseNumberField(text, "confidence");
  const params = parseLooseParams(text);

  return {
    reply,
    action,
    module: moduleValue && moduleValue !== "null" ? moduleValue : null,
    params,
    style: style && style !== "null" ? style : null,
    confidence: confidence ?? undefined,
  };
}

function matchLooseStringField(text: string, field: string): string | null {
  const nextField = field === "reply" ? "action" : field === "action" ? "module" : field === "module" ? "params" : null;
  const pattern = nextField
    ? new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"${nextField}"`)
    : new RegExp(`"${field}"\\s*:\\s*(?:"([\\s\\S]*?)"|null)(?:\\s*,|\\s*})`);
  const match = text.match(pattern);
  if (!match) return null;
  return unescapeLooseJsonString(match[1] || "null").trim();
}

function parseLooseParams(text: string): Record<string, unknown> {
  const match = text.match(/"params"\s*:\s*(\{[\s\S]*?\})\s*,\s*"style"/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function matchLooseNumberField(text: string, field: string): number | null {
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*([0-9.]+)`));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function unescapeLooseJsonString(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "  ")
    .replace(/\\\\/g, "\\");
}

function buildModuleParams(
  module: string,
  llmParams: Record<string, unknown>,
  imageMap: Map<number, string>,
  opts: { model: LingyaModel; aspectRatio: AspectRatio; imageSize: ImageSize; count: number; style: string | null }
): Record<string, unknown> | null {
  // 获取所有可用图片 URL（按图号排序）
  const allUrls = Array.from(imageMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, url]) => url);

  // 每个模块的默认提示词（当 LLM 未返回 prompt 时使用）
  const DEFAULT_PROMPTS: Record<string, string> = {
    tryon: "photorealistic fashion photo, model wearing the clothing, natural lighting, 8K ultra-detailed, sharp details, commercial photography quality",
    grass: "social media lifestyle photo, natural lighting, candid fashion photography, warm atmosphere, real person sharing",
    model: "exclusive AI model portrait, natural skin texture, professional fashion photography, clean background",
    model_background: "professional fashion photography with natural background integration, consistent lighting and shadows",
    pose: "2x2 four-panel pose grid, same person same clothing same scene, different natural poses, consistent camera angle",
    garment_3d: "3D garment display, clean white studio background, volumetric lighting, commercial product photography",
  };

  const userPrompt = typeof llmParams.prompt === "string" && llmParams.prompt.trim()
    ? llmParams.prompt.trim()
    : DEFAULT_PROMPTS[module] || "professional fashion photography, high quality, detailed";

  const base: Record<string, unknown> = {
    ai_model: opts.model,
    aspect_ratio: opts.aspectRatio,
    image_size: opts.imageSize,
    gen_count: opts.count,
    prompt: userPrompt,
  };

  switch (module) {
    case "tryon": {
      const clothing = resolveImageUrls(llmParams.clothing_urls ?? [1], imageMap);
      if (clothing.length === 0) {
        if (allUrls.length > 0) {
          base.clothing_urls = [allUrls[0]];
        } else {
          // 文生图：没有图片但有 prompt，用 prompt 直接生成
          return base;
        }
      } else {
        base.clothing_urls = clothing;
      }
      const ref = resolveImageUrl(llmParams.reference_url, imageMap);
      if (ref) base.reference_url = ref;
      const face = resolveImageUrl(llmParams.model_face_url, imageMap);
      if (face) base.model_face_url = face;
      if (opts.style) base.style = opts.style;
      return base;
    }
    case "grass": {
      const garment = resolveImageUrl(llmParams.garment_url ?? 1, imageMap) || allUrls[0];
      if (!garment) return null;
      base.garment_url = garment;
      base.scene_mode = "auto";
      const ref = resolveImageUrl(llmParams.reference_url, imageMap);
      if (ref) base.reference_url = ref;
      return base;
    }
    case "model": {
      const refs = resolveImageUrls(llmParams.reference_urls ?? [1], imageMap);
      if (refs.length > 0) {
        base.reference_urls = refs;
      } else if (allUrls[0]) {
        base.reference_urls = [allUrls[0]];
      } else {
        return null;
      }
      base.gender = "female";
      if (opts.style) base.model_style = opts.style;
      return base;
    }
    case "model_background": {
      const source = resolveImageUrl(llmParams.source_url ?? 1, imageMap) || allUrls[0];
      if (!source) return null;
      base.source_url = source;
      base.mode = typeof llmParams.mode === "string" ? llmParams.mode : "background_only";
      base.background_source = "auto_prompt";
      const bgRef = resolveImageUrl(llmParams.background_reference_url, imageMap);
      if (bgRef) base.background_reference_url = bgRef;
      return base;
    }
    case "pose": {
      const main = resolveImageUrl(llmParams.main_image_url ?? 1, imageMap) || allUrls[0];
      if (!main) return null;
      base.main_image_url = main;
      return base;
    }
    case "garment_3d": {
      const garment = resolveImageUrl(llmParams.garment_url ?? 1, imageMap) || allUrls[0];
      if (!garment) return null;
      base.garment_url = garment;
      return base;
    }
    default:
      return null;
  }
}

/**
 * 兜底意图检测：当 LLM 返回 chat 但用户消息包含明确的生图意图时
 */
/**
 * 判断是否为纯聊天意图（不应该触发生图）
 */
function isChatOnlyIntent(text: string): boolean {
  return /^(你是谁|你好|谢谢|为什么|怎么|如何|什么是|请问|分析|分析一|看看|这个是什么|解释|推荐|建议|适合什么)/.test(text);
}

function normalizeIntentMode(value?: string): AgentIntentMode {
  if (value === "chat" || value === "create" || value === "smart") return value;
  return "smart";
}

function getIntentModeInstruction(mode: AgentIntentMode): string {
  if (mode === "chat") {
    return "当前模式：聊天。只能回答、分析、追问和给建议；不要返回 generate，不要触发生成确认卡。";
  }
  if (mode === "create") {
    return "当前模式：创作。用户表达创作或改图意图时，可以更积极整理为生成任务；但图片关系不明确时仍需先追问。";
  }
  return "当前模式：智能。聊天优先；只有用户明确要求生成、改图、换装、换背景、种草、3D、姿势裂变时才返回 generate。";
}

function isCommerceDesignIntent(text: string): boolean {
  return /淘宝|天猫|京东|详情页|商品详情|电商详情|主图|banner|Banner|海报|落地页|长图|卖点图|参数图/.test(text);
}

function buildGeneralGenerationPrompt(text: string, commerceDesign: boolean): string {
  const userText = text.trim();
  if (!commerceDesign) return userText;
  return [
    "根据提供的参考图片生成电商视觉设计，不要当成小红书种草图或街拍图。",
    "目标是淘宝/天猫商品详情页或电商长图版式：包含首屏主视觉、核心卖点区、细节展示区、参数/功能区，画面要像可直接用于商品详情页的商业设计稿。",
    "保留参考图中的商品/服装主体特征、材质、颜色和风格气质，可以根据电商页面需要重新组织构图、背景、文案层级、图标和版面。",
    userText ? `用户原始需求：${userText}` : "",
  ].filter(Boolean).join("\n");
}

function isStandaloneTextGenerationIntent(text: string): boolean {
  if (!/生成|制作|出图|做一张|来一张|画一张|给我.*图|帮我.*图/.test(text)) return false;
  return !/图\s*\d|图片\s*\d|@图\d|这张|这件|这条|这个|上身|换装|试穿|穿到|穿在|种草|小红书|换背景|换场景|3[dD]|立体|姿势|四宫格/.test(text);
}

function detectGenerationIntent(text: string): string | null {
  const rules: Array<[RegExp, string]> = [
    // 明确的模块意图
    [/淘宝|天猫|京东|详情页|商品详情|电商详情|主图|banner|Banner|海报|落地页|长图|卖点图|参数图/, "general"],
    [/换[装到上]|穿[到在]|试穿|上身|换装/, "tryon"],
    [/种草|小红书|街拍.*图/, "grass"],
    [/3[dD]|立体|商品展示/, "garment_3d"],
    [/专属模特|建模特|定制脸/, "model"],
    [/换背景|换场景|换模特/, "model_background"],
    [/四宫格|姿势裂变|pose/i, "pose"],
    // 修改/调整意图（已有图片上下文，用户要求修改）
    [/不对|不对啊|错了|重新|重做|换个|换一|改一下|调整|修改|换掉/, "tryon"],
    // 服装描述 + 参考/替换（隐含换装意图）
    [/上装|下装|上衣|裤子|裙子|外套|内搭|搭配/, "tryon"],
    // 通用生图意图
    [/生成|制作|出图|做一张|来一张|画一张|给我.*图|帮我.*图/, "tryon"],
  ];
  for (const [pattern, mod] of rules) {
    if (pattern.test(text)) return mod;
  }
  return null;
}

/**
 * 将 snake_case 模块参数转换为 camelCase jobPayload（generation-jobs 校验要求）
 */
function buildJobPayload(
  module: string,
  params: Record<string, unknown>,
  opts: { model: LingyaModel; aspectRatio: AspectRatio; imageSize: ImageSize; count: number }
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    kind: module,
    aiModel: opts.model,
    aspectRatio: opts.aspectRatio,
    imageSize: opts.imageSize,
    prompt: String(params.prompt || ""),
    genCount: opts.count,
  };

  switch (module) {
    case "tryon":
      return {
        ...base,
        clothingUrls: Array.isArray(params.clothing_urls) ? params.clothing_urls : [params.clothing_urls].filter(Boolean),
        clothingMode: "single",
        garmentAudience: "women",
        ageGroup: "adult",
      };
    case "grass":
      return {
        ...base,
        garmentUrl: String(params.garment_url || ""),
        sceneMode: "auto",
        templateId: "street",
        changeModel: true,
        userPrompt: String(params.prompt || ""),
      };
    case "model":
      return {
        ...base,
        referenceUrls: Array.isArray(params.reference_urls) ? params.reference_urls : [params.reference_urls].filter(Boolean),
        gender: typeof params.gender === "string" ? params.gender : "female",
      };
    case "model_background":
      return {
        ...base,
        sourceUrl: String(params.source_url || ""),
        mode: typeof params.mode === "string" ? params.mode : "background_only",
        backgroundSource: "auto_prompt",
        templateId: "default",
        backgroundText: "",
        userPrompt: String(params.prompt || ""),
      };
    case "pose":
      return { ...base, mainImageUrl: String(params.main_image_url || "") };
    case "garment_3d":
      return {
        ...base,
        garmentUrl: String(params.garment_url || ""),
        garmentType: "服装",
        outputMode: "prompt",
        displayStyle: "default",
        userPrompt: String(params.prompt || ""),
      };
    default:
      return base;
  }
}

function extractClothingUrls(params: Record<string, unknown>): string[] {
  for (const key of ["clothing_urls", "reference_urls"]) {
    const val = params[key];
    if (Array.isArray(val) && val.length > 0) return val as string[];
  }
  for (const key of ["garment_url", "source_url", "main_image_url"]) {
    const val = params[key];
    if (typeof val === "string") return [val];
  }
  return [];
}
