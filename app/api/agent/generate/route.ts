/**
 * POST /api/agent/generate
 * 核心：解析用户意图 → 路由到对应生成模块 → 返回 generation_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  createDebitedGeneration,
  errorToResponsePayload,
} from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
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

const SYSTEM_PROMPT = `你是 VastWear AI 服装生图助手。根据用户消息和上传的图片，判断应该调用哪个生图模块并提取参数。

可用模块：
1. tryon — 服装上身/换装。需要 clothing_urls（服装图数组）
2. grass — 种草图/街拍图。需要 garment_url（服装图）
3. garment_3d — 3D 立体展示。需要 garment_url（服装图）
4. model — 专属模特。需要 reference_urls（参考人脸图数组）
5. model_background — 换背景/换模特。需要 source_url（原图）
6. pose — 姿势裂变/四宫格。需要 main_image_url（主图）

严格按 JSON 回复，不要其他内容：
{
  "module": "tryon|grass|garment_3d|model|model_background|pose",
  "imageMapping": { "clothing_urls": [1], "reference_url": 2, "model_face_url": 3 },
  "prompt": "自动根据图片生成的专业提示词",
  "style": "韩系清透|电商白底|时尚杂志|小红书生活感|欧美 Campaign|轻奢 Lookbook|null"
}

imageMapping 中的数字对应图1/图2/图3的编号。
prompt 要基于图片内容自动生成专业摄影提示词。
style 从用户消息中提取，没有则为 null。`;

type RequestBody = {
  message: string;
  images: Array<{ index: number; url: string }>;
  params: { model: string; aspectRatio: string; imageSize: string; count: number };
  history?: Array<{ role: string; content: string }>;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`agent-generate:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const { message, images, params: userParams, history } = body;

    if (!message?.trim() && (!images || images.length === 0)) {
      return NextResponse.json({ error: "请输入指令或上传图片" }, { status: 400 });
    }

    // 解析参数
    const model: LingyaModel = normalizeLingyaModel(userParams?.model);
    const aspectRatio: AspectRatio = normalizeAspectRatio(userParams?.aspectRatio || "3:4");
    const imageSize: ImageSize = normalizeImageSize(model, (userParams?.imageSize as ImageSize) || "1K", aspectRatio);
    const count = Math.min(Math.max(Number(userParams?.count) || 1, 1), 4);

    // 调用 LLM 解析意图
    const llm = getLlmConfig("vision");
    let module = "tryon";
    let prompt = message || "";
    let imageMapping: Record<string, number | number[]> = {};
    let style: string | null = null;

    if (llm.apiKey && llm.baseUrl && images && images.length > 0) {
      try {
        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...(history || []).slice(-6).map((h) => ({ role: h.role, content: h.content })),
          {
            role: "user",
            content: [
              { type: "text", text: `用户指令：${message || "根据图片生成"}\n\n图片编号：${images.map((img) => `图${img.index}`).join("、")}` },
              ...images.map((img) => ({ type: "image_url", image_url: { url: img.url } })),
            ],
          },
        ];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(getChatCompletionsUrl(llm), {
          method: "POST",
          headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: llm.model, messages, max_tokens: 500, temperature: 0.2 }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (res.ok) {
          const data = await res.json();
          const content = extractText(data);
          const parsed = parseJson(content);
          if (parsed) {
            module = typeof parsed.module === "string" ? parsed.module : "tryon";
            imageMapping = typeof parsed.imageMapping === "object" && parsed.imageMapping !== null
              ? parsed.imageMapping as Record<string, number | number[]>
              : {};
            prompt = typeof parsed.prompt === "string" ? parsed.prompt : (message || "");
            style = typeof parsed.style === "string" && parsed.style !== "null" ? parsed.style : null;
          }
        }
      } catch {
        // LLM 失败，使用默认
      }
    }

    // 构建图片 URL 映射
    const imageMap = new Map<number, string>();
    for (const img of images || []) {
      imageMap.set(img.index, img.url);
    }

    // 根据模块构建 API 参数
    const apiParams = buildModuleParams(module, imageMapping, imageMap, {
      model, aspectRatio, imageSize, count, prompt, style,
    });

    if (!apiParams) {
      // 如果没有图片，回退到 Chat 模式回答
      if (!images || images.length === 0) {
        return NextResponse.json({
          error: "no_images",
          message: "请先上传图片，再输入生成指令。你也可以切换到 Chat 模式进行对话。",
        }, { status: 400 });
      }
      return NextResponse.json({ error: "无法解析指令，请更明确地描述需求，例如：帮我把图1的衣服穿到图2身上" }, { status: 400 });
    }

    // 计算积分
    const costPerImage = getCreditCost(model, imageSize, aspectRatio);
    const totalCost = costPerImage * count;

    // 扣减积分 + 创建 generation
    const getUrls = (): string[] => {
      const cl = apiParams.clothing_urls;
      if (Array.isArray(cl)) return cl as string[];
      const gr = apiParams.garment_url;
      if (typeof gr === "string") return [gr];
      const rr = apiParams.reference_urls;
      if (Array.isArray(rr)) return rr as string[];
      const sr = apiParams.source_url;
      if (typeof sr === "string") return [sr];
      const mr = apiParams.main_image_url;
      if (typeof mr === "string") return [mr];
      return [];
    };

    // 构建 jobPayload（必须用 camelCase，generation-jobs 校验要求）
    const jobPayload = buildJobPayload(module, apiParams, {
      model, aspectRatio, imageSize, count, prompt, style,
    });

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: getUrls(),
      modelFaceUrl: typeof apiParams.model_face_url === "string" ? apiParams.model_face_url : null,
      referenceUrl: typeof apiParams.reference_url === "string" ? apiParams.reference_url : null,
      creditsCost: totalCost,
      aiModel: model,
      imageSize,
      reason: `Agent ${module} ${count} 张 (${model}, ${imageSize})`,
      jobPayload,
    });

    // 启动后台任务
    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      module,
      credits_cost: totalCost,
      credits_remaining: debit.creditsRemaining,
    });
  } catch (err: unknown) {
    console.error("[agent-generate] error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

// GET 轮询
export async function GET(request: NextRequest) {
  const generationId = request.nextUrl.searchParams.get("generation_id");
  if (!generationId) return NextResponse.json({ error: "Missing generation_id" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data: gen } = await supabase
    .from("generations")
    .select("status,result_urls,error_message")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    status: gen.status,
    result_urls: gen.result_urls || [],
    error: gen.error_message,
  });
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  return "";
}

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function resolveImageRef(ref: number | number[] | undefined, imageMap: Map<number, string>): string | string[] | null {
  if (ref == null) return null;
  if (Array.isArray(ref)) {
    const urls = ref.map((i) => imageMap.get(i)).filter(Boolean) as string[];
    return urls.length > 0 ? urls : null;
  }
  return imageMap.get(ref) || null;
}

function buildModuleParams(
  module: string,
  mapping: Record<string, number | number[]>,
  imageMap: Map<number, string>,
  opts: { model: LingyaModel; aspectRatio: AspectRatio; imageSize: ImageSize; count: number; prompt: string; style: string | null }
): Record<string, unknown> | null {
  const base: Record<string, unknown> = {
    ai_model: opts.model,
    aspect_ratio: opts.aspectRatio,
    image_size: opts.imageSize,
    gen_count: opts.count,
    prompt: opts.prompt,
  };

  if (opts.style) base.style = opts.style;

  switch (module) {
    case "tryon": {
      const clothing = resolveImageRef(mapping.clothing_urls ?? 1, imageMap);
      if (!clothing) return null;
      base.clothing_urls = Array.isArray(clothing) ? clothing : [clothing];
      const ref = resolveImageRef(mapping.reference_url, imageMap);
      if (ref) base.reference_url = Array.isArray(ref) ? ref[0] : ref;
      const face = resolveImageRef(mapping.model_face_url, imageMap);
      if (face) base.model_face_url = Array.isArray(face) ? face[0] : face;
      return base;
    }
    case "grass": {
      const garment = resolveImageRef(mapping.garment_url ?? 1, imageMap);
      if (!garment) return null;
      base.garment_url = Array.isArray(garment) ? garment[0] : garment;
      base.scene_mode = "auto";
      const ref = resolveImageRef(mapping.reference_url, imageMap);
      if (ref) base.reference_url = Array.isArray(ref) ? ref[0] : ref;
      return base;
    }
    case "garment_3d": {
      const garment = resolveImageRef(mapping.garment_url ?? 1, imageMap);
      if (!garment) return null;
      base.garment_url = Array.isArray(garment) ? garment[0] : garment;
      return base;
    }
    case "model": {
      const refs = resolveImageRef(mapping.reference_urls ?? 1, imageMap);
      if (!refs) return null;
      base.reference_urls = Array.isArray(refs) ? refs : [refs];
      base.gender = "female";
      return base;
    }
    case "model_background": {
      const source = resolveImageRef(mapping.source_url ?? 1, imageMap);
      if (!source) return null;
      base.source_url = Array.isArray(source) ? source[0] : source;
      base.mode = "background_only";
      base.background_source = "auto_prompt";
      const ref = resolveImageRef(mapping.background_reference_url, imageMap);
      if (ref) base.background_reference_url = Array.isArray(ref) ? ref[0] : ref;
      return base;
    }
    case "pose": {
      const main = resolveImageRef(mapping.main_image_url ?? 1, imageMap);
      if (!main) return null;
      base.main_image_url = Array.isArray(main) ? main[0] : main;
      return base;
    }
    default:
      return null;
  }
}

/**
 * 将 snake_case API 参数转换为 camelCase jobPayload（generation-jobs 校验要求）
 */
function buildJobPayload(
  module: string,
  apiParams: Record<string, unknown>,
  opts: { model: LingyaModel; aspectRatio: AspectRatio; imageSize: ImageSize; count: number; prompt: string; style: string | null }
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    kind: module,
    aiModel: opts.model,
    aspectRatio: opts.aspectRatio,
    imageSize: opts.imageSize,
    prompt: opts.prompt,
    genCount: opts.count,
  };

  if (opts.style) base.style = opts.style;

  switch (module) {
    case "tryon":
      return {
        ...base,
        clothingUrls: Array.isArray(apiParams.clothing_urls) ? apiParams.clothing_urls : [],
        modelFaceUrl: typeof apiParams.model_face_url === "string" ? apiParams.model_face_url : null,
        referenceUrl: typeof apiParams.reference_url === "string" ? apiParams.reference_url : null,
        clothingMode: "single",
        garmentAudience: "women",
        ageGroup: "adult",
      };
    case "grass":
      return {
        ...base,
        garmentUrl: typeof apiParams.garment_url === "string" ? apiParams.garment_url : "",
        referenceUrl: typeof apiParams.reference_url === "string" ? apiParams.reference_url : null,
        sceneMode: "auto",
        templateId: "street",
        changeModel: true,
        userPrompt: opts.prompt,
      };
    case "model":
      return {
        ...base,
        referenceUrls: Array.isArray(apiParams.reference_urls) ? apiParams.reference_urls : [],
        hairReferenceUrl: typeof apiParams.hair_reference_url === "string" ? apiParams.hair_reference_url : null,
        gender: "female",
        modelStyle: "fusion_natural",
      };
    case "model_background":
      return {
        ...base,
        sourceUrl: typeof apiParams.source_url === "string" ? apiParams.source_url : "",
        modelReferenceUrl: typeof apiParams.model_reference_url === "string" ? apiParams.model_reference_url : null,
        backgroundReferenceUrl: typeof apiParams.background_reference_url === "string" ? apiParams.background_reference_url : null,
        mode: "background_only",
        backgroundSource: "auto_prompt",
        templateId: "default",
        backgroundText: "",
        userPrompt: opts.prompt,
      };
    case "pose":
      return {
        ...base,
        mainImageUrl: typeof apiParams.main_image_url === "string" ? apiParams.main_image_url : "",
      };
    case "garment_3d":
      return {
        ...base,
        garmentUrl: typeof apiParams.garment_url === "string" ? apiParams.garment_url : "",
        referenceUrl: typeof apiParams.reference_url === "string" ? apiParams.reference_url : null,
        garmentType: "服装",
        outputMode: "prompt",
        displayStyle: "default",
        userPrompt: opts.prompt,
      };
    default:
      return base;
  }
}
