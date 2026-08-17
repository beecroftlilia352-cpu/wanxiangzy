import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { getConfiguredImageCreditCost } from "@/lib/ai-control-plane/server";
import { createDebitedGeneration, errorToResponsePayload } from "@/lib/api/credits";
import { startGenerationJob, type GenerationJobPayload } from "@/lib/api/generation-jobs";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  buildImageTranslationPrompt,
  enforceImageTranslationPromptRequirements,
  MAX_IMAGE_TRANSLATION_IMAGES,
  MAX_IMAGE_TRANSLATION_LANGUAGES,
  normalizeImageTranslationLanguageCodes,
  normalizeImageTranslationSourceUrls,
} from "@/lib/image-translation";

export const maxDuration = 60;

/**
 * 图片翻译主任务。
 * 入参：source_urls[]、languages[]（语种 code/label）、ai_model、image_size、user_prompt、prompt、gen_count
 * 期望产出数 = sourceUrls.length × languages.length × gen_count
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`image-translation:${user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-validated below
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }

    const fallbackUrl = typeof body.source_url === "string" ? body.source_url.trim() : "";
    const sourceUrls = normalizeImageTranslationSourceUrls(body.source_urls, fallbackUrl);
    if (!sourceUrls.length) {
      return NextResponse.json({ error: "请先上传需要翻译的商品图" }, { status: 400 });
    }
    if (sourceUrls.length > MAX_IMAGE_TRANSLATION_IMAGES) {
      return NextResponse.json({ error: `最多支持 ${MAX_IMAGE_TRANSLATION_IMAGES} 张原图` }, { status: 400 });
    }

    const knownLanguages = await loadKnownLanguageCodes();
    const languages = normalizeImageTranslationLanguageCodes(body.languages, knownLanguages);
    if (!languages.length) {
      return NextResponse.json({ error: "请选择至少 1 种目标语言" }, { status: 400 });
    }
    if (languages.length > MAX_IMAGE_TRANSLATION_LANGUAGES) {
      return NextResponse.json({ error: `最多支持 ${MAX_IMAGE_TRANSLATION_LANGUAGES} 种目标语言` }, { status: 400 });
    }

    const model: LingyaModel = normalizeLingyaModel(body.ai_model);
    // 比例默认走 "auto"（即原图比例），由 smart_aspect_image 推断
    const aspectRatio: AspectRatio = normalizeAspectRatio(body.aspect_ratio || "auto", "auto");
    const size: ImageSize = normalizeImageSize(
      model,
      (typeof body.image_size === "string" ? body.image_size : "1K") as ImageSize,
      aspectRatio
    );
    const genCount = Math.min(Math.max(Number(body.gen_count) || 1, 1), 4);

    const languageLabels = Array.isArray(body.language_labels)
      ? body.language_labels.filter((label: unknown): label is string => typeof label === "string" && label.length > 0)
      : languages;

    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt.trim() : "";

    const rawPrompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : buildImageTranslationPrompt({
            sourceCount: sourceUrls.length,
            languages,
            languageLabels,
            userPrompt,
            aiModel: model,
            imageSize: size,
          });

    const prompt = enforceImageTranslationPromptRequirements(rawPrompt, {
      sourceCount: sourceUrls.length,
      languages,
      languageLabels,
    });

    const expectedCount = sourceUrls.length * languages.length * genCount;
    const totalCost = await getConfiguredImageCreditCost(model, size) * expectedCount;

    const jobPayload: GenerationJobPayload = {
      kind: "imageTranslation",
      publicBaseUrl: getPublicBaseUrlFromRequest(request),
      sourceUrl: sourceUrls[0] || "",
      sourceUrls,
      languages,
      languageLabels,
      aiModel: model,
      aspectRatio,
      imageSize: size,
      prompt,
      genCount,
    };

    const debit = await createDebitedGeneration(supabase, {
      userId: user.id,
      clothingUrls: sourceUrls,
      creditsCost: totalCost,
      aiModel: model,
      imageSize: size,
      reason: `图片翻译 ${sourceUrls.length} 张原图 × ${languages.length} 种语言 × ${genCount} (${model}, ${size})`,
      jobPayload,
    });

    startGenerationJob(debit.generationId);

    return NextResponse.json({
      generation_id: debit.generationId,
      credits_cost: totalCost,
      expected_count: expectedCount,
      credits_remaining: debit.creditsRemaining,
      status: "processing_tryon",
    });
  } catch (err: unknown) {
    console.error("[image-translation] POST error:", err instanceof Error ? err.message : err);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}

type LanguageCode = { code: string };

async function loadKnownLanguageCodes(): Promise<LanguageCode[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl}/api/image-translation-languages`;
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as { data?: unknown };
    const payload = raw?.data;
    if (!Array.isArray(payload)) return [];
    const codes = new Set<string>();
    const seenLabels = new Set<string>();
    for (const region of payload) {
      const children = (region as { children?: unknown })?.children;
      if (!Array.isArray(children)) continue;
      for (const group of children) {
        if (!Array.isArray(group)) continue;
        for (const entry of group) {
          if (!entry || typeof entry !== "object") continue;
          const obj = entry as { enLabel?: unknown; label?: unknown };
          const enLabel = typeof obj.enLabel === "string" ? obj.enLabel.trim() : "";
          const label = typeof obj.label === "string" ? obj.label.trim() : "";
          const code = enLabel || label;
          if (code && !seenLabels.has(code)) {
            seenLabels.add(code);
            codes.add(code);
          }
        }
      }
    }
    return Array.from(codes).map((code) => ({ code }));
  } catch {
    return [];
  }
}
