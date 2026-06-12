import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import {
  POSE_VISUAL_ANALYSIS_VERSION,
  fallbackPoseVisualAnalysis,
  normalizePoseVisualAnalysis,
  type PoseVisualAnalysis,
} from "@/lib/pose-analysis";

const DEFAULT_TIMEOUT_MS = 12_000;
const POSE_ANALYSIS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const POSE_ANALYSIS_CACHE_MAX_ENTRIES = 300;
const POSE_ANALYSIS_CACHE_MIN_CONFIDENCE = 0.5;

type PoseAnalysisSource = "vision" | "fallback";

type PoseAnalysisResult = {
  source: PoseAnalysisSource;
  analysis: PoseVisualAnalysis;
  rawResponse: unknown;
};

const poseAnalysisCache = new Map<string, {
  expiresAt: number;
  result: PoseAnalysisResult;
}>();
const poseAnalysisInflight = new Map<string, Promise<PoseAnalysisResult>>();

type PoseAnalyzeImageRequest = {
  main_image_url?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.poseVisualAnalyze);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => ({})) as PoseAnalyzeImageRequest;
  const mainImageUrl = typeof body.main_image_url === "string" ? body.main_image_url.trim() : "";
  if (!mainImageUrl) {
    return NextResponse.json({ error: "请先上传主图" }, { status: 400 });
  }

  const llm = getLlmConfig("vision");
  const config = {
    apiKey: process.env.POSE_ANALYZE_IMAGE_API_KEY || llm.apiKey,
    baseUrl: normalizeOpenAiCompatibleBaseUrl(process.env.POSE_ANALYZE_IMAGE_BASE_URL || llm.baseUrl),
    model: process.env.POSE_ANALYZE_IMAGE_MODEL || llm.model,
  };
  const cacheKey = buildPoseAnalysisCacheKey(mainImageUrl);
  const cached = readPoseAnalysisMemoryCache(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      source: cached.source,
      analysis: cached.analysis,
      raw: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  let inflightRequest = poseAnalysisInflight.get(cacheKey);
  if (!inflightRequest) {
    const nextRequest = runPoseVisualAnalysis({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      mainImageUrl,
    });
    poseAnalysisInflight.set(cacheKey, nextRequest);
    void nextRequest.finally(() => {
      if (poseAnalysisInflight.get(cacheKey) === nextRequest) {
        poseAnalysisInflight.delete(cacheKey);
      }
    }).catch(() => undefined);
    inflightRequest = nextRequest;
  }

  const result = await inflightRequest;
  if (shouldCachePoseAnalysisResult(result)) {
    writePoseAnalysisMemoryCache(cacheKey, result);
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    source: result.source,
    analysis: result.analysis,
    raw: result.rawResponse,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function runPoseVisualAnalysis(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  mainImageUrl: string;
}): Promise<PoseAnalysisResult> {
  if (!input.apiKey || !input.baseUrl || !input.model) {
    return {
      source: "fallback",
      analysis: fallbackPoseVisualAnalysis(),
      rawResponse: null,
    };
  }

  try {
    const result = await requestPoseVisualAnalysis(input);
    const analysis = normalizePoseVisualAnalysis(result.parsed?.analysis ?? result.parsed)
      || fallbackPoseVisualAnalysis();
    return {
      source: "vision",
      analysis,
      rawResponse: result.raw,
    };
  } catch (error) {
    console.warn("[pose/analyze-image] provider fallback:", error);
    return {
      source: "fallback",
      analysis: fallbackPoseVisualAnalysis(),
      rawResponse: null,
    };
  }
}

async function requestPoseVisualAnalysis(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  mainImageUrl: string;
}) {
  const timeoutMs = Number(process.env.POSE_ANALYZE_IMAGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(getChatCompletionsUrl({
      provider: "lingya",
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
    }), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是姿势裂变主图视觉识别助手。只返回 JSON，不要输出解释。",
              "你的任务是识别图1事实，不是生成最终提示词，也不要创造新姿势。",
              "返回 { analysis: {...} }。",
              "字段：personVisible, personCount, genderExpression, ageRange, bodyCrop, headVisible, faceVisible, upperTorsoVisible, lowerBodyVisible, bodyOrientation, headDirection, poseBaseline, cameraFraming, cameraAngle, outfitDescription, hairDescription, faceIdentityNotes, skinToneNotes, background, lighting, handsVisible, feetVisible, occlusionNotes, generationRisks, promptNotes, confidence。",
              "genderExpression 只能是 male/female/androgynous/unknown。",
              "ageRange 只能是 child/teen/adult/unknown。",
              "bodyCrop 只能是 full_body/three_quarter/upper_body/lower_body/closeup/partial_unknown。",
              "headVisible, faceVisible, upperTorsoVisible, lowerBodyVisible, handsVisible, feetVisible 必须是 boolean。",
              "如果画面从腰部、腹部、胯部、大腿、膝盖或脚部开始，头和脸不在画面内，即使能看到一点上衣、手臂或包袋，也必须判定 bodyCrop=lower_body，headVisible=false，faceVisible=false。",
              "如果上半身或七分身画面裁掉头/脸，必须 headVisible=false 或 faceVisible=false，并在 generationRisks 加 headless crop 或 face not visible。",
              "不要把无头局部图识别为可规划表情的人像；没有脸就不要写 faceIdentityNotes。",
              "generationRisks 写 0-5 个短风险，例如 gender drift, face drift, body proportion drift, hand distortion, crop expansion。",
              "promptNotes 用一句英文写给生成模型：姿势变化时必须保持什么、禁止改变什么；无头/无脸图必须明确 no head, no face, do not expand to full portrait。",
              "confidence 必须是 0 到 1 的数字，例如 0.86；不要返回 high、medium、low 或百分比字符串。",
              "如果无法确认，填 unknown 或 partial_unknown，不要猜测细节。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "识别这张姿势裂变主图。",
                  "重点判断人物性别表达、年龄感、身体裁切范围、头部是否可见、脸是否可见、上半身是否可见、下半身是否可见、源姿势、镜头构图、服装细节、脸部身份、发型、肤色、背景光线、手脚是否可见，以及生成姿势裂变时最容易漂移的风险。",
                ].join("\n"),
              },
              {
                type: "image_url",
                image_url: { url: input.mainImageUrl },
              },
            ],
          },
        ],
        max_tokens: 900,
      }),
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof raw?.error?.message === "string" ? raw.error.message : `vision ${response.status}`);
    }
    const content = extractMessageContent(raw);
    return {
      raw,
      parsed: parseJsonObject(content),
    };
  } finally {
    clearTimeout(timer);
  }
}

function readPoseAnalysisMemoryCache(cacheKey: string) {
  const cached = poseAnalysisCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    poseAnalysisCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function writePoseAnalysisMemoryCache(cacheKey: string, result: PoseAnalysisResult) {
  if (poseAnalysisCache.size >= POSE_ANALYSIS_CACHE_MAX_ENTRIES) {
    const oldestKey = poseAnalysisCache.keys().next().value;
    if (oldestKey) poseAnalysisCache.delete(oldestKey);
  }
  poseAnalysisCache.set(cacheKey, {
    expiresAt: Date.now() + POSE_ANALYSIS_CACHE_TTL_MS,
    result,
  });
}

function shouldCachePoseAnalysisResult(result: PoseAnalysisResult) {
  if (result.source !== "vision") return false;
  if (result.analysis.confidence < POSE_ANALYSIS_CACHE_MIN_CONFIDENCE) return false;
  return hasMeaningfulPoseAnalysis(result.analysis);
}

function hasMeaningfulPoseAnalysis(analysis: PoseVisualAnalysis) {
  if (analysis.genderExpression !== "unknown") return true;
  if (analysis.ageRange !== "unknown") return true;
  if (analysis.bodyCrop !== "partial_unknown") return true;
  if (typeof analysis.headVisible === "boolean" || typeof analysis.faceVisible === "boolean") return true;
  return Boolean(
    analysis.poseBaseline
    || analysis.cameraFraming
    || analysis.outfitDescription
    || analysis.background
    || analysis.lighting
    || analysis.promptNotes
  );
}

function buildPoseAnalysisCacheKey(mainImageUrl: string) {
  return createHash("sha256").update(JSON.stringify({
    version: POSE_VISUAL_ANALYSIS_VERSION,
    mainImageUrl: normalizeCacheUrl(mainImageUrl),
  })).digest("hex");
}

function normalizeCacheUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return value.split("?")[0].trim().toLowerCase();
  }
}

function extractMessageContent(raw: any) {
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => typeof item?.text === "string" ? item.text : "").join("\n");
  }
  return "";
}

function parseJsonObject(content: string): any {
  const trimmed = stripJsonCodeFence(content.trim());
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}

function stripJsonCodeFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
