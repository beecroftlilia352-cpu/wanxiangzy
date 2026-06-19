import { NextRequest, NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api/auth";
import { completeGenerationWithCreditAdjustment, createDebitedGeneration, errorToResponsePayload, failGenerationWithRefund } from "@/lib/api/credits";
import { storeMedia } from "@/lib/api/media-storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import { audioMimeType, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";

export const runtime = "nodejs";
export const maxDuration = 120;

const AUDIO_CREDIT_COST = 1;
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`infinite-canvas-audio:${auth.user.id}`, 12, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "请输入音频生成内容" }, { status: 400 });

  const api = getAudioApiConfig();
  if (!api.apiKey || !api.baseUrl) {
    return NextResponse.json({ error: "无限画布音频模型未配置" }, { status: 503 });
  }

  const model = normalizeAudioModel(body.model, api.model);
  const voice = normalizeAudioVoiceValue(String(body.voice || ""));
  const format = normalizeAudioFormatValue(String(body.format || ""));
  const speed = normalizeAudioSpeedValue(String(body.speed || ""));
  const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 1200) : "";
  const input = instructions ? `${instructions}\n\n${prompt}` : prompt;
  const jobPayload = {
    kind: "infiniteCanvasAudio",
    prompt,
    model,
    voice,
    format,
    speed,
    instructions,
  };

  let generationId = "";
  try {
    const debit = await createDebitedGeneration(auth.supabase, {
      userId: auth.user.id,
      clothingUrls: [],
      modelFaceUrl: null,
      referenceUrl: null,
      creditsCost: AUDIO_CREDIT_COST,
      aiModel: model,
      imageSize: `audio/${format}`,
      reason: `无限画布音频生成 (${model}, ${voice}, ${format}, ${speed}x)`,
      jobPayload,
    });
    generationId = debit.generationId;

    const audio = await requestSpeechAudio({
      apiKey: api.apiKey,
      baseUrl: api.baseUrl,
      model,
      voice,
      format,
      speed,
      input,
    });
    const stored = await storeMedia(
      {
        media: audio.dataUrl,
        name: "infinite-canvas-audio",
        namePrefix: "generated-audio-",
        storageClass: "generated",
      },
      { timeoutMs: 120_000 },
    );

    await completeGenerationWithCreditAdjustment(auth.supabase, {
      userId: auth.user.id,
      generationId,
      resultUrls: [stored.url],
      jobPayload,
      creditsUsed: AUDIO_CREDIT_COST,
      refundAmount: 0,
      refundReason: "音频生成完成",
    });

    return NextResponse.json({
      generation_id: generationId,
      credits_cost: AUDIO_CREDIT_COST,
      credits_remaining: debit.creditsRemaining,
      url: stored.url,
      audio: audio.dataUrl,
      mimeType: audio.mimeType,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (generationId) {
      await failGenerationWithRefund(auth.supabase, {
        userId: auth.user.id,
        generationId,
        amount: AUDIO_CREDIT_COST,
        reason: "音频生成失败退还",
        errorMessage: message,
      });
    }
    console.error("[infinite-canvas:audio] POST error:", message);
    const payload = errorToResponsePayload(err);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

async function requestSpeechAudio(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  format: string;
  speed: string;
  input: string;
}) {
  const response = await fetch(`${input.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      voice: input.voice,
      input: input.input,
      response_format: input.format,
      speed: Number(input.speed) || 1,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const contentType = response.headers.get("content-type") || audioMimeType(input.format);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(readProviderError(bytes, contentType) || `音频模型请求失败 (${response.status})`);
  }
  if (!bytes.length) throw new Error("音频模型没有返回内容");

  const mimeType = contentType.split(";")[0] || audioMimeType(input.format);
  return {
    mimeType,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}

function getAudioApiConfig() {
  const rawBaseUrl =
    process.env.YUNWU_API_BASE_URL ||
    process.env.YUNWU_NATIVE_BASE_URL ||
    process.env.LINGYA_BASE_URL ||
    "https://yunwu.ai";
  return {
    apiKey: process.env.YUNWU_API_KEY || process.env.YUNWU_NATIVE_API_KEY || process.env.LINGYA_API_KEY || "",
    baseUrl: normalizeOpenAiCompatibleBaseUrl(rawBaseUrl),
    model: process.env.YUNWU_TTS_MODEL || process.env.LINGYA_TTS_MODEL || DEFAULT_TTS_MODEL,
  };
}

function normalizeAudioModel(value: unknown, fallback: string) {
  const model = typeof value === "string" ? value.split("::").pop()?.trim() || "" : "";
  if (!model) return fallback;
  const lower = model.toLowerCase();
  if (lower.includes("tts") || lower.includes("speech") || lower.includes("audio") || lower.includes("voice")) return model;
  return fallback;
}

function readProviderError(bytes: Buffer, contentType: string) {
  const text = bytes.toString("utf8").trim();
  if (!text) return "";
  if (contentType.toLowerCase().includes("json")) {
    try {
      const payload = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
      if (typeof payload.error === "string") return payload.error;
      if (payload.error && typeof payload.error === "object" && typeof payload.error.message === "string") return payload.error.message;
      if (typeof payload.message === "string") return payload.message;
    } catch {
      return text.slice(0, 500);
    }
  }
  return text.slice(0, 500);
}
