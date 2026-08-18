import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { executeLlmChatRouted } from "@/lib/api/llm-routing.server";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import {
  getTryOnVisionFallbackReasonText,
  toTryOnVisionFallbackReason,
  type TryOnVisionFallbackReason,
} from "@/lib/api/tryon-vision-provider";
import {
  alignTryOnReferenceAnalyses,
  createFallbackTryOnReferenceAnalysis,
  type TryOnReferenceAnalysis,
} from "@/lib/tryon-reference-analysis";
import { normalizeTryOnAgeGroup, normalizeTryOnGarmentAudience } from "@/lib/tryon-prompt";
import { normalizeTryOnClothingMode, normalizeTryOnClothingRole } from "@/lib/tryon-upload-rules";

const MAX_REFERENCE_IMAGES = 8;
const REFERENCE_ANALYSIS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REFERENCE_ANALYSIS_CACHE_MAX_ENTRIES = 300;
const REFERENCE_ANALYSIS_CACHE_MIN_CONFIDENCE = 0.5;

type ReferenceAnalysisResult = {
  source: "ai" | "fallback";
  analyses: TryOnReferenceAnalysis[];
  rawResponse: unknown;
  fallbackReason: TryOnVisionFallbackReason | null;
  reasonText: string | null;
};

const referenceAnalysisCache = new Map<string, {
  expiresAt: number;
  result: ReferenceAnalysisResult;
}>();
const referenceAnalysisInflight = new Map<string, Promise<ReferenceAnalysisResult>>();

type ReferenceAnalyzeRequest = {
  reference_urls?: unknown;
  clothing_mode?: unknown;
  clothing_roles?: unknown;
  garment_audience?: unknown;
  age_group?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.tryonReferenceAnalyze);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => ({})) as ReferenceAnalyzeRequest;
  const referenceUrls = normalizeUrlArray(body.reference_urls).slice(0, MAX_REFERENCE_IMAGES);
  if (!referenceUrls.length) {
    return NextResponse.json({ error: "请先选择参考图" }, { status: 400 });
  }

  const clothingMode = normalizeTryOnClothingMode(typeof body.clothing_mode === "string" ? body.clothing_mode : undefined);
  const clothingRoles = Array.isArray(body.clothing_roles)
    ? body.clothing_roles.map((role) => normalizeTryOnClothingRole(role))
    : [];
  const garmentAudience = normalizeTryOnGarmentAudience(typeof body.garment_audience === "string" ? body.garment_audience : undefined);
  const ageGroup = normalizeTryOnAgeGroup(typeof body.age_group === "string" ? body.age_group : undefined);

  const cacheKey = buildReferenceAnalysisCacheKey({
    referenceUrls,
    clothingMode,
    clothingRoles,
    garmentAudience,
    ageGroup,
  });
  const cached = readReferenceAnalysisMemoryCache(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      source: cached.source,
      analyses: cached.analyses,
      raw: null,
      fallbackReason: cached.fallbackReason,
      reasonText: cached.reasonText,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  let inflightRequest = referenceAnalysisInflight.get(cacheKey);
  if (!inflightRequest) {
    const nextRequest = runReferenceAnalysis({
      referenceUrls,
      clothingMode,
      clothingRoles,
      garmentAudience,
      ageGroup,
      userId: auth.user.id,
    });
    referenceAnalysisInflight.set(cacheKey, nextRequest);
    void nextRequest.finally(() => {
      if (referenceAnalysisInflight.get(cacheKey) === nextRequest) {
        referenceAnalysisInflight.delete(cacheKey);
      }
    }).catch(() => undefined);
    inflightRequest = nextRequest;
  }

  const result = await inflightRequest;
  if (shouldCacheReferenceAnalysisResult(result, referenceUrls.length)) {
    writeReferenceAnalysisMemoryCache(cacheKey, result);
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    source: result.source,
    analyses: result.analyses,
    raw: result.rawResponse,
    fallbackReason: result.fallbackReason,
    reasonText: result.reasonText,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function runReferenceAnalysis(input: {
  referenceUrls: string[];
  clothingMode: string;
  clothingRoles: string[];
  garmentAudience: string;
  ageGroup: string;
  userId: string;
}): Promise<ReferenceAnalysisResult> {
  let analyses: TryOnReferenceAnalysis[];
  let source: "ai" | "fallback" = "fallback";
  let rawResponse: unknown = null;
  let fallbackReason: TryOnVisionFallbackReason | null = null;
  try {
    const result = await requestYunwuReferenceAnalysis({
      referenceUrls: input.referenceUrls,
      clothingMode: input.clothingMode,
      clothingRoles: input.clothingRoles,
      garmentAudience: input.garmentAudience,
      ageGroup: input.ageGroup,
      userId: input.userId,
    });
    rawResponse = result.raw;
    analyses = alignTryOnReferenceAnalyses(result.parsed, input.referenceUrls.length);
    source = "ai";
    if (analyses.length !== input.referenceUrls.length) analyses = alignTryOnReferenceAnalyses(analyses, input.referenceUrls.length);
    return { source, analyses, rawResponse, fallbackReason, reasonText: null };
  } catch (error) {
    fallbackReason = toTryOnVisionFallbackReason(error);
    console.warn("[tryon/analyze-references] control-plane failed:", {
      reason: fallbackReason,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  analyses = input.referenceUrls.map((_, index) => createFallbackTryOnReferenceAnalysis(index + 1));

  if (analyses.length !== input.referenceUrls.length) {
    analyses = alignTryOnReferenceAnalyses(analyses, input.referenceUrls.length);
  }

  return {
    source,
    analyses,
    rawResponse,
    fallbackReason,
    reasonText: getTryOnVisionFallbackReasonText(fallbackReason),
  };
}

async function requestYunwuReferenceAnalysis(input: {
  referenceUrls: string[];
  clothingMode: string;
  clothingRoles: string[];
  garmentAudience: string;
  ageGroup: string;
  userId: string;
}) {
  const completion = await executeLlmChatRouted({
    kind: "vision",
    context: { userId: input.userId },
    body: {
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是服装上身参考图识别助手。只返回 JSON，不要输出解释。",
              "你识别的是参考图/目标画面，不是服装源图。",
              "返回 { items: [...] }，每张参考图一项。",
              "字段：index, bodyCrop, personVisible, faceVisible, headVisible, upperBodyVisible, lowerBodyVisible, handsVisible, feetVisible, detailFocus, promptNotes, confidence。",
              "bodyCrop 只能是 full_body/three_quarter/upper_body/lower_body/closeup/scene_only/partial_unknown。",
              "如果是下装局部、腿部、腰胯、裤脚、鞋履参考，bodyCrop=lower_body；如果无脸局部，不要把 faceVisible/headVisible 写成 true。",
              "如果参考图是上半身、下半身、腿部、无头局部或特写，promptNotes 必须写成硬性裁切/姿势指令：保持同类可见身体范围和镜头距离，不要扩成 full-body，不要补出未出现的 head/face/torso/legs/feet。",
              "如果只有下半身、腿部、裤子、鞋履或腰胯到脚，bodyCrop=lower_body，personVisible=true，faceVisible=false，headVisible=false，upperBodyVisible=false；promptNotes 必须描述最佳下半身姿势，而不是完整人物姿势。",
              "如果只有上半身、肩颈、胸口、手臂或半身特写，bodyCrop=upper_body 或 closeup；promptNotes 必须保持上半身/特写裁切，不要要求生成腿部或全身。",
              "promptNotes 用一句英文写给生成模型：最终应该保留的构图/身体范围/是否禁止补脸或扩成全身。",
              "confidence 必须是 0 到 1 的数字，例如 0.86；不要返回 high、medium、low 或百分比字符串。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `识别这些服装上身参考图。clothing_mode=${input.clothingMode}, clothing_roles=${input.clothingRoles.join(",") || "none"}, garment_audience=${input.garmentAudience}, age_group=${input.ageGroup}。`,
                  "重点判断：参考图是全身、上半身、下半身、局部特写、纯场景，脸/头/手/脚是否可见，以及生成时是否必须禁止补出参考图没有出现的人脸、头部、完整身体或参考图外的肢体。",
                ].join("\n"),
              },
              ...input.referenceUrls.map((url) => ({
                type: "image_url",
                image_url: { url },
              })),
            ],
          },
        ],
    },
    validate: (data) => {
      const content = extractMessageContent(data);
      if (!content.trim()) throw new Error("tryon reference returned empty content");
      if (!hasReferenceAnalysisItems(parseJsonObject(content))) throw new Error("tryon reference returned no analysis items");
    },
  });
  return {
    raw: completion.data,
    parsed: parseJsonObject(extractMessageContent(completion.data)),
  };
}

function hasReferenceAnalysisItems(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Array.isArray(record.items) || Array.isArray(record.analyses);
}

function readReferenceAnalysisMemoryCache(cacheKey: string) {
  const cached = referenceAnalysisCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    referenceAnalysisCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function writeReferenceAnalysisMemoryCache(cacheKey: string, result: ReferenceAnalysisResult) {
  if (referenceAnalysisCache.size >= REFERENCE_ANALYSIS_CACHE_MAX_ENTRIES) {
    const oldestKey = referenceAnalysisCache.keys().next().value;
    if (oldestKey) referenceAnalysisCache.delete(oldestKey);
  }
  referenceAnalysisCache.set(cacheKey, {
    expiresAt: Date.now() + REFERENCE_ANALYSIS_CACHE_TTL_MS,
    result,
  });
}

function shouldCacheReferenceAnalysisResult(result: ReferenceAnalysisResult, expectedCount: number) {
  if (result.source !== "ai") return false;
  if (result.analyses.length !== expectedCount) return false;
  return result.analyses.every((analysis) => analysis.confidence >= REFERENCE_ANALYSIS_CACHE_MIN_CONFIDENCE);
}

function buildReferenceAnalysisCacheKey(value: {
  referenceUrls: string[];
  clothingMode: string;
  clothingRoles: string[];
  garmentAudience: string;
  ageGroup: string;
}) {
  return createHash("sha256").update(JSON.stringify({
    ...value,
    referenceUrls: value.referenceUrls.map((url) => normalizeCacheUrl(url)),
    clothingRoles: [...new Set(value.clothingRoles)].sort(),
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

function normalizeUrlArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function extractMessageContent(raw: unknown) {
  const content = (raw as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(readContentPartText).join("\n");
  }
  return "";
}

function readContentPartText(item: unknown) {
  return item && typeof item === "object" && "text" in item && typeof item.text === "string" ? item.text : "";
}

function parseJsonObject(content: string) {
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
