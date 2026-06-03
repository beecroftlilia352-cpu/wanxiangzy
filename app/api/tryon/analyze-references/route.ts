import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import {
  alignTryOnReferenceAnalyses,
  createFallbackTryOnReferenceAnalysis,
  type TryOnReferenceAnalysis,
} from "@/lib/tryon-reference-analysis";
import { normalizeTryOnAgeGroup, normalizeTryOnGarmentAudience } from "@/lib/tryon-prompt";
import { normalizeTryOnClothingMode, normalizeTryOnClothingRole } from "@/lib/tryon-upload-rules";

const DEFAULT_MODEL = "gpt-5-nano";
const DEFAULT_BASE_URL = "https://yunwu.ai/v1";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_REFERENCE_IMAGES = 8;
const REFERENCE_ANALYSIS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REFERENCE_ANALYSIS_CACHE_MAX_ENTRIES = 300;

type ReferenceAnalysisResult = {
  source: "yunwu" | "fallback";
  analyses: TryOnReferenceAnalysis[];
  rawResponse: unknown;
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

  const model = process.env.TRYON_REFERENCE_ANALYZE_MODEL || process.env.TRYON_CLOTHING_ANALYZE_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.TRYON_REFERENCE_ANALYZE_API_KEY || process.env.TRYON_CLOTHING_ANALYZE_API_KEY || process.env.LINGYA_API_KEY || "";
  const baseUrl = normalizeOpenAiBaseUrl(process.env.TRYON_REFERENCE_ANALYZE_BASE_URL || process.env.TRYON_CLOTHING_ANALYZE_BASE_URL || process.env.LINGYA_BASE_URL || DEFAULT_BASE_URL);
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
    }, { headers: { "Cache-Control": "no-store" } });
  }

  let inflightRequest = referenceAnalysisInflight.get(cacheKey);
  if (!inflightRequest) {
    const nextRequest = runReferenceAnalysis({
      apiKey,
      baseUrl,
      model,
      referenceUrls,
      clothingMode,
      clothingRoles,
      garmentAudience,
      ageGroup,
    });
    referenceAnalysisInflight.set(cacheKey, nextRequest);
    void nextRequest.finally(() => {
      if (referenceAnalysisInflight.get(cacheKey) === nextRequest) {
        referenceAnalysisInflight.delete(cacheKey);
      }
    });
    inflightRequest = nextRequest;
  }

  const result = await inflightRequest;
  writeReferenceAnalysisMemoryCache(cacheKey, result);

  return NextResponse.json({
    ok: true,
    cached: false,
    source: result.source,
    analyses: result.analyses,
    raw: result.rawResponse,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function runReferenceAnalysis(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  referenceUrls: string[];
  clothingMode: string;
  clothingRoles: string[];
  garmentAudience: string;
  ageGroup: string;
}): Promise<ReferenceAnalysisResult> {
  let analyses: TryOnReferenceAnalysis[];
  let source: "yunwu" | "fallback" = "fallback";
  let rawResponse: unknown = null;

  if (input.apiKey) {
    try {
      const result = await requestYunwuReferenceAnalysis({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        referenceUrls: input.referenceUrls,
        clothingMode: input.clothingMode,
        clothingRoles: input.clothingRoles,
        garmentAudience: input.garmentAudience,
        ageGroup: input.ageGroup,
      });
      rawResponse = result.raw;
      analyses = alignTryOnReferenceAnalyses(result.parsed, input.referenceUrls.length);
      source = "yunwu";
    } catch (error) {
      console.warn("[tryon/analyze-references] provider fallback:", error);
      analyses = input.referenceUrls.map((_, index) => createFallbackTryOnReferenceAnalysis(index + 1));
    }
  } else {
    analyses = input.referenceUrls.map((_, index) => createFallbackTryOnReferenceAnalysis(index + 1));
  }

  if (analyses.length !== input.referenceUrls.length) {
    analyses = alignTryOnReferenceAnalyses(analyses, input.referenceUrls.length);
  }

  return {
    source,
    analyses,
    rawResponse,
  };
}

async function requestYunwuReferenceAnalysis(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  referenceUrls: string[];
  clothingMode: string;
  clothingRoles: string[];
  garmentAudience: string;
  ageGroup: string;
}) {
  const timeoutMs = Number(process.env.TRYON_REFERENCE_ANALYZE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${input.baseUrl}/chat/completions`, {
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
      }),
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof raw?.error?.message === "string" ? raw.error.message : `Yunwu ${response.status}`);
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

function normalizeOpenAiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function normalizeUrlArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function extractMessageContent(raw: any) {
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => typeof item?.text === "string" ? item.text : "").join("\n");
  }
  return "";
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}
