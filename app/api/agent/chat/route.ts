/**
 * POST /api/agent/chat
 * 统一 Agent API：LLM 理解意图 → 自动路由到生图模块 → 返回结果
 *
 * 不再需要单独调用 /api/agent/generate 或 /api/agent/plan
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
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

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是 VastWear AI 助手。根据用户消息和图片，判断应该做什么。

严格返回 JSON，不要其他内容：
{"reply":"你的回复","action":"chat或generate","module":"模块名或null","params":{},"style":null}

action 规则：
- 用户要生成图片且有图片 → "generate"
- 其他 → "chat"

module（仅 generate 时）：
- "tryon"：换装/穿上/试穿/上身
- "grass"：种草/小红书/街拍
- "garment_3d"：3D/立体
- "model"：专属模特/建模特
- "model_background"：换背景/换场景
- "pose"：四宫格/姿势裂变

params 中的图片引用用图号：{"clothing_urls":["图1"],"reference_url":"图2"}

示例：
用户："把图1穿到图2身上" + 2张图
→ {"reply":"好的，正在生成换装图...","action":"generate","module":"tryon","params":{"clothing_urls":["图1"],"reference_url":"图2"},"style":null}

用户："你是谁"
→ {"reply":"我是VastWear AI助手...","action":"chat","module":null,"params":{},"style":null}`;

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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { message, images, history, params: userParams } = body as {
      message?: string;
      images?: Array<{ index: number; url: string }>;
      history?: Array<{ role: string; content: string }>;
      params?: { model?: string; aspectRatio?: string; imageSize?: string; count?: number };
    };

    if (!message?.trim() && (!images || images.length === 0)) {
      return NextResponse.json({ reply: "请输入消息或上传图片。", action: "chat" });
    }

    const hasImages = images && images.length > 0;
    const llm = getLlmConfig(hasImages ? "vision" : "text");

    if (!llm.apiKey || !llm.baseUrl) {
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
    const userText = (message || "").trim() || "请分析这些图片并推荐操作";
    const imageDesc = hasImages ? `\n图片：${images!.map((img) => `图${img.index}`).join("、")}` : "";
    userContent.push({ type: "text", text: `${userText}${imageDesc}` });

    if (hasImages) {
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    }
    messages.push({ role: "user", content: userContent });

    // 调用 LLM
    let llmContent = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40000);
      const res = await fetch(getChatCompletionsUrl(llm), {
        method: "POST",
        headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: llm.model, messages, max_tokens: 800, temperature: 0.3 }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (res.ok) {
        const data = await res.json();
        llmContent = extractText(data);
      }
    } catch {}

    // 解析 LLM 响应
    const parsed = extractJson(llmContent);
    const reply = typeof parsed?.reply === "string" ? parsed.reply : (llmContent || "处理完成。");
    const action = parsed?.action === "generate" && hasImages ? "generate" : "chat";
    const module = typeof parsed?.module === "string" ? parsed.module : null;
    const llmParams = typeof parsed?.params === "object" && parsed.params !== null ? parsed.params as Record<string, unknown> : {};
    const style = typeof parsed?.style === "string" ? parsed.style : null;

    // 如果是对话模式，直接返回
    if (action !== "generate" || !module || !MODULE_API[module]) {
      return NextResponse.json({ reply, action: "chat" });
    }

    // 生图模式：构建参数并调用生成 API
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ reply: "请先登录。", action: "chat" });

    const model: LingyaModel = normalizeLingyaModel(userParams?.model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(userParams?.aspectRatio || "3:4");
    const imageSize: ImageSize = normalizeImageSize(model, (userParams?.imageSize as ImageSize) || "1K", aspectRatio);
    const count = Math.min(Math.max(Number(userParams?.count) || 1, 1), 4);
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);
    const totalCost = costPerImage * count;

    // 构建模块参数
    const imageMap = new Map<number, string>();
    for (const img of images!) imageMap.set(img.index, img.url);

    const moduleParams = buildModuleParams(module, llmParams, imageMap, {
      model, aspectRatio, imageSize, count, style,
    });

    if (!moduleParams) {
      return NextResponse.json({
        reply: `${reply}\n\n⚠️ 无法自动构建参数，请在专业模式中手动操作。`,
        action: "chat",
      });
    }

    // 扣减积分
    const clothingUrls = extractClothingUrls(moduleParams);
    try {
      const debit = await createDebitedGeneration(supabase, {
        userId: user.id,
        clothingUrls,
        modelFaceUrl: typeof moduleParams.model_face_url === "string" ? moduleParams.model_face_url : null,
        referenceUrl: typeof moduleParams.reference_url === "string" ? moduleParams.reference_url : null,
        creditsCost: totalCost,
        aiModel: model,
        imageSize,
        reason: `Agent ${MODULE_LABELS[module] || module} ${count}张 (${model})`,
        jobPayload: { kind: module, ...moduleParams, aiModel: model, aspectRatio, imageSize, prompt: moduleParams.prompt || "", genCount: count },
      });

      startGenerationJob(debit.generationId);

      return NextResponse.json({
        reply,
        action: "generate",
        module,
        generation_id: debit.generationId,
        credits_cost: totalCost,
        credits_remaining: debit.creditsRemaining,
      });
    } catch (err) {
      const payload = errorToResponsePayload(err);
      return NextResponse.json({
        reply: `${reply}\n\n⚠️ ${payload.body.error || "生成失败"}`,
        action: "chat",
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === "AbortError" ? "AI 响应超时，请重试。" : "处理出错。";
    return NextResponse.json({ reply: msg, action: "chat" });
  }
}

// ---- 工具函数 ----

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  return typeof msg?.content === "string" ? msg.content : "";
}

function extractJson(text: string): Record<string, unknown> | null {
  // 尝试多种提取策略
  const strategies = [
    () => JSON.parse(text.trim()),
    () => { const m = text.match(/\{[\s\S]*?"reply"[\s\S]*?\}/); return m ? JSON.parse(m[0]) : null; },
    () => { const m = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/); return m ? JSON.parse(m[1]) : null; },
    () => { const i = text.lastIndexOf("{"), j = text.lastIndexOf("}"); return i >= 0 && j > i ? JSON.parse(text.slice(i, j + 1)) : null; },
  ];

  for (const tryParse of strategies) {
    try {
      const result = tryParse();
      if (result && typeof result === "object" && "reply" in result) return result;
    } catch {}
  }
  return null;
}

function resolveImageUrl(ref: unknown, imageMap: Map<number, string>): string | null {
  if (typeof ref === "string") {
    const match = ref.match(/图(\d+)/);
    if (match) return imageMap.get(parseInt(match[1])) || null;
    if (ref.startsWith("http")) return ref;
  }
  if (typeof ref === "number") return imageMap.get(ref) || null;
  return null;
}

function resolveImageUrls(ref: unknown, imageMap: Map<number, string>): string[] {
  if (Array.isArray(ref)) {
    return ref.map((r) => resolveImageUrl(r, imageMap)).filter(Boolean) as string[];
  }
  const single = resolveImageUrl(ref, imageMap);
  return single ? [single] : [];
}

function buildModuleParams(
  module: string,
  llmParams: Record<string, unknown>,
  imageMap: Map<number, string>,
  opts: { model: LingyaModel; aspectRatio: AspectRatio; imageSize: ImageSize; count: number; style: string | null }
): Record<string, unknown> | null {
  const base: Record<string, unknown> = {
    ai_model: opts.model,
    aspect_ratio: opts.aspectRatio,
    image_size: opts.imageSize,
    gen_count: opts.count,
    prompt: typeof llmParams.prompt === "string" ? llmParams.prompt : "",
  };

  switch (module) {
    case "tryon": {
      const clothing = resolveImageUrls(llmParams.clothing_urls ?? 1, imageMap);
      if (clothing.length === 0) return null;
      base.clothing_urls = clothing;
      const ref = resolveImageUrl(llmParams.reference_url, imageMap);
      if (ref) base.reference_url = ref;
      const face = resolveImageUrl(llmParams.model_face_url, imageMap);
      if (face) base.model_face_url = face;
      if (opts.style) base.style = opts.style;
      return base;
    }
    case "grass": {
      const garment = resolveImageUrl(llmParams.garment_url ?? 1, imageMap);
      if (!garment) return null;
      base.garment_url = garment;
      base.scene_mode = "auto";
      const ref = resolveImageUrl(llmParams.reference_url, imageMap);
      if (ref) base.reference_url = ref;
      return base;
    }
    case "model": {
      const refs = resolveImageUrls(llmParams.reference_urls ?? 1, imageMap);
      if (refs.length === 0) return null;
      base.reference_urls = refs;
      base.gender = typeof llmParams.gender === "string" ? llmParams.gender : "female";
      if (opts.style) base.model_style = opts.style;
      return base;
    }
    case "model_background": {
      const source = resolveImageUrl(llmParams.source_url ?? 1, imageMap);
      if (!source) return null;
      base.source_url = source;
      base.mode = typeof llmParams.mode === "string" ? llmParams.mode : "background_only";
      base.background_source = "auto_prompt";
      const bgRef = resolveImageUrl(llmParams.background_reference_url, imageMap);
      if (bgRef) base.background_reference_url = bgRef;
      return base;
    }
    case "pose": {
      const main = resolveImageUrl(llmParams.main_image_url ?? 1, imageMap);
      if (!main) return null;
      base.main_image_url = main;
      return base;
    }
    case "garment_3d": {
      const garment = resolveImageUrl(llmParams.garment_url ?? 1, imageMap);
      if (!garment) return null;
      base.garment_url = garment;
      return base;
    }
    default:
      return null;
  }
}

function extractClothingUrls(params: Record<string, unknown>): string[] {
  for (const key of ["clothing_urls", "reference_urls"]) {
    const val = params[key];
    if (Array.isArray(val)) return val as string[];
  }
  for (const key of ["garment_url", "source_url", "main_image_url"]) {
    const val = params[key];
    if (typeof val === "string") return [val];
  }
  return [];
}
