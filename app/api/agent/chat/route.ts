/**
 * POST /api/agent/chat
 * 统一 Agent API：LLM 理解意图 → 自动路由到生图模块 → 返回结果
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

const SYSTEM_PROMPT = `你是 VastWear AI 助手，一个专业的服装电商视觉 AI 智能体。你精通服装摄影、电商视觉、AI 图像生成。

## 你的能力

1. **图片分析**：识别服装品类、颜色、面料、风格、适用场景
2. **视觉建议**：推荐拍摄风格、构图、配色、场景搭配
3. **图像生成**：调用生图模块生成换装/种草/3D/换背景/姿势裂变/专属模特
4. **专业对话**：回答服装、电商、摄影相关问题

## 回复规则

你的回复必须是严格的 JSON 格式，不要输出任何其他内容：

\`\`\`json
{
  "reply": "你的详细回复（中文，支持Markdown格式，要专业、详细、有深度，至少3-5句话）",
  "action": "chat 或 generate",
  "module": "模块名或null",
  "params": {},
  "style": null
}
\`\`\`

### reply 字段要求
- 必须详细、专业、有深度（至少3句话，最好5-10句话）
- 分析图片时要具体：品类、颜色、面料、风格、适合场景、拍摄建议
- 用 Markdown 格式：**粗体**、• 列表、分段
- 像一个资深的电商视觉顾问在给客户做方案

### action 字段规则
- 用户明确要求生成/制作/出图，且有图片 → "generate"
- 用户只是聊天/提问/分析/咨询 → "chat"
- 不确定 → "chat"

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
    const userText = (message || "").trim();
    const imageDesc = hasImages
      ? `\n\n图片编号：${images!.map((img) => `图${img.index}（${guessImageRole(img.index, images!.length, userText)}）`).join("、")}`
      : "";
    userContent.push({ type: "text", text: `${userText || "请分析这些图片并推荐操作"}${imageDesc}` });

    if (hasImages) {
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    }
    messages.push({ role: "user", content: userContent });

    // 调用 LLM（带降级）
    let llmContent = "";
    const providers = [llm];
    if (llm.provider === "xiaomi") {
      const lingya = getLlmConfig(hasImages ? "vision" : "text");
      if (lingya.provider !== "xiaomi" && lingya.apiKey && lingya.baseUrl) providers.push(lingya);
    }

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
          llmContent = extractText(data);
          break;
        }
      } catch {}
    }

    // 解析 LLM 响应
    const parsed = extractJson(llmContent);
    const reply = typeof parsed?.reply === "string" && parsed.reply.length > 10
      ? parsed.reply
      : llmContent || "我理解了你的需求，正在处理中...";
    let action = parsed?.action === "generate" && hasImages ? "generate" : "chat";
    let module = typeof parsed?.module === "string" ? parsed.module : null;
    const llmParams = typeof parsed?.params === "object" && parsed.params !== null ? parsed.params as Record<string, unknown> : {};
    const style = typeof parsed?.style === "string" ? parsed.style : null;

    // 兜底：如果 LLM 返回 chat 但用户消息明确包含生图意图 + 有图片 → 强制 generate
    if (action === "chat" && hasImages) {
      const detected = detectGenerationIntent(userText);
      if (detected) {
        action = "generate";
        module = detected;
      }
    }

    // 对话模式：直接返回
    if (action !== "generate" || !module || !MODULE_API[module]) {
      return NextResponse.json({ reply, action: "chat" });
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

    // 构建模块参数
    const moduleParams = buildModuleParams(module, llmParams, imageMap, {
      model, aspectRatio, imageSize, count, style,
    });


    if (!moduleParams) {
      console.error("[agent-chat] buildModuleParams failed", { module, llmParams, imageMapKeys: Array.from(imageMap.keys()) });
      return NextResponse.json({
        reply: `${reply}\n\n⚠️ 参数构建失败，请尝试更明确地描述，例如："把图1的衣服穿到图2身上"`,
        action: "chat",
      });
    }

    // 不直接执行，返回确认信息让用户确认后才扣积分
    return NextResponse.json({
      reply,
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

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  return typeof msg?.content === "string" ? msg.content : "";
}

function extractJson(text: string): Record<string, unknown> | null {
  const strategies = [
    () => JSON.parse(text.trim()),
    () => { const m = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/); return m ? JSON.parse(m[1]) : null; },
    () => { const m = text.match(/\{[\s\S]*?"reply"[\s\S]*?\}/); return m ? JSON.parse(m[0]) : null; },
    () => { const i = text.lastIndexOf("{"), j = text.lastIndexOf("}"); return i >= 0 && j > i ? JSON.parse(text.slice(i, j + 1)) : null; },
  ];
  for (const fn of strategies) {
    try {
      const r = fn();
      if (r && typeof r === "object" && "reply" in r) return r;
    } catch {}
  }
  return null;
}

function resolveImageUrl(ref: unknown, imageMap: Map<number, string>): string | null {
  if (typeof ref === "string") {
    const m = ref.match(/图(\d+)/);
    if (m) return imageMap.get(parseInt(m[1])) || null;
    if (ref.startsWith("http")) return ref;
  }
  if (typeof ref === "number") return imageMap.get(ref) || null;
  return null;
}

function resolveImageUrls(ref: unknown, imageMap: Map<number, string>): string[] {
  if (Array.isArray(ref)) return ref.map((r) => resolveImageUrl(r, imageMap)).filter(Boolean) as string[];
  const s = resolveImageUrl(ref, imageMap);
  return s ? [s] : [];
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
  if (allUrls.length === 0) return null;

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
        base.clothing_urls = [allUrls[0]];
      } else {
        base.clothing_urls = clothing;
      }
      base.clothing_urls = clothing;
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
      const refs = resolveImageUrls(llmParams.reference_urls ?? [1], imageMap); if (refs.length === 0) { base.reference_urls = [allUrls[0]]; } else { base.reference_urls = refs; }
      if (refs.length === 0) return null;
      base.reference_urls = refs;
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
function detectGenerationIntent(text: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/换[装到上]|穿[到在]|试穿|上身/, "tryon"],
    [/种草|小红书|街拍.*图/, "grass"],
    [/3[dD]|立体/, "garment_3d"],
    [/专属模特|建模特|定制脸/, "model"],
    [/换背景|换场景|换模特/, "model_background"],
    [/四宫格|姿势裂变/, "pose"],
    [/生成|制作|出图|做一张|来一张/, "tryon"], // 通用生图意图默认 tryon
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
