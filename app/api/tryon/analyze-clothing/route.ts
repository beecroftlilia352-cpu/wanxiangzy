import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import {
  TryOnVisionProviderError,
  buildTryOnClothingVisionProviderConfigs,
  toTryOnVisionFallbackReason,
  type TryOnVisionProviderConfig,
} from "@/lib/api/tryon-vision-provider";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTryOnClothingAnalysis,
  type TryOnClothingAnalysis,
} from "@/lib/tryon-reference-config";
import { normalizeTryOnAgeGroup, normalizeTryOnGarmentAudience } from "@/lib/tryon-prompt";
import {
  TRYON_CLOTHING_ROLE_LABELS,
  normalizeTryOnClothingMode,
  normalizeTryOnClothingRole,
  type TryOnClothingRole,
} from "@/lib/tryon-upload-rules";

const DEFAULT_MODEL = "gpt-5-nano";
const DEFAULT_BASE_URL = "https://yunwu.ai/v1";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_ANALYZE_IMAGES = 4;
const CLOTHING_ANALYSIS_CACHE_MIN_CONFIDENCE = 0.5;

type ClothingAnalysisResult = {
  source: "yunwu" | "fallback";
  analysis: TryOnClothingAnalysis;
  rawResponse: unknown;
  providerModel: string;
};

const clothingAnalysisInflight = new Map<string, Promise<ClothingAnalysisResult>>();

type ClothingAnalyzeRequest = {
  clothing_urls?: unknown;
  clothing_mode?: unknown;
  clothing_roles?: unknown;
  garment_audience?: unknown;
  age_group?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.tryonClothingAnalyze);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => ({})) as ClothingAnalyzeRequest;
  const clothingUrls = normalizeUrlArray(body.clothing_urls).slice(0, MAX_ANALYZE_IMAGES);
  if (!clothingUrls.length) {
    return NextResponse.json({ error: "请先上传服装图" }, { status: 400 });
  }

  const clothingMode = normalizeTryOnClothingMode(typeof body.clothing_mode === "string" ? body.clothing_mode : undefined);
  const requestedClothingRoles = Array.isArray(body.clothing_roles) ? body.clothing_roles : [];
  const clothingRoles = requestedClothingRoles.length
    ? clothingUrls.map((_, index) => normalizeTryOnClothingRole(
      requestedClothingRoles[index],
      clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single"
    ))
    : clothingUrls.map((_, index) => clothingMode === "multi" ? index === 0 ? "upper" : index === 1 ? "lower" : "extra" : "single");
  const garmentAudience = normalizeTryOnGarmentAudience(typeof body.garment_audience === "string" ? body.garment_audience : undefined);
  const ageGroup = normalizeTryOnAgeGroup(typeof body.age_group === "string" ? body.age_group : undefined);
  const cacheKey = buildAnalysisCacheKey({ clothingUrls, clothingMode, clothingRoles, garmentAudience, ageGroup });

  const cached = await readCachedAnalysis(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      source: "cache",
      analysis: cached,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const providerConfigs = buildTryOnClothingVisionProviderConfigs(DEFAULT_BASE_URL, DEFAULT_MODEL);

  let inflightRequest = clothingAnalysisInflight.get(cacheKey);
  if (!inflightRequest) {
    const nextRequest = runClothingAnalysis({
      providerConfigs,
      clothingUrls,
      clothingMode,
      clothingRoles,
      garmentAudience,
      ageGroup,
    });
    clothingAnalysisInflight.set(cacheKey, nextRequest);
    void nextRequest.finally(() => {
      if (clothingAnalysisInflight.get(cacheKey) === nextRequest) {
        clothingAnalysisInflight.delete(cacheKey);
      }
    });
    inflightRequest = nextRequest;
  }

  const result = await inflightRequest;

  if (shouldCacheClothingAnalysis(result)) {
    await writeCachedAnalysis({
      cacheKey,
      clothingUrls,
      clothingMode,
      clothingRoles,
      garmentAudience,
      ageGroup,
      analysis: result.analysis,
      provider: result.source,
      model: result.providerModel,
      rawResponse: result.rawResponse,
    });
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    source: result.source,
    analysis: result.analysis,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function runClothingAnalysis(input: {
  providerConfigs: TryOnVisionProviderConfig[];
  clothingUrls: string[];
  clothingMode: string;
  clothingRoles: TryOnClothingRole[];
  garmentAudience: string;
  ageGroup: string;
}): Promise<ClothingAnalysisResult> {
  let analysis: TryOnClothingAnalysis;
  let source: "yunwu" | "fallback" = "fallback";
  let rawResponse: unknown = null;
  let providerModel = input.providerConfigs[0]?.model || DEFAULT_MODEL;

  for (const provider of input.providerConfigs) {
    try {
      const result = await requestYunwuClothingAnalysis({
        provider,
        clothingUrls: input.clothingUrls,
        clothingMode: input.clothingMode,
        clothingRoles: input.clothingRoles,
        garmentAudience: input.garmentAudience,
        ageGroup: input.ageGroup,
      });
      rawResponse = result.raw;
      analysis = applyUserRoleToClothingAnalysis(normalizeTryOnClothingAnalysis({
        ...result.parsed,
        genderType: result.parsed.genderType || input.garmentAudience,
        ageRange: result.parsed.ageRange || input.ageGroup,
        raw: result.raw,
      }), input.clothingRoles, input.clothingUrls.length);
      source = "yunwu";
      providerModel = provider.model;
      return {
        source,
        analysis,
        rawResponse,
        providerModel,
      };
    } catch (error) {
      console.warn("[tryon/analyze-clothing] provider failed:", {
        provider: provider.label,
        baseUrl: redactBaseUrl(provider.baseUrl),
        model: provider.model,
        reason: toTryOnVisionFallbackReason(error),
        status: error instanceof TryOnVisionProviderError ? error.status : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  analysis = applyUserRoleToClothingAnalysis(normalizeTryOnClothingAnalysis({
    cloth_type: getFallbackClothType(input),
    desc: "",
    genderType: input.garmentAudience,
    ageRange: input.ageGroup,
  }), input.clothingRoles, input.clothingUrls.length);

  return {
    source,
    analysis,
    rawResponse,
    providerModel,
  };
}

async function requestYunwuClothingAnalysis(input: {
  provider: TryOnVisionProviderConfig;
  clothingUrls: string[];
  clothingMode: string;
  clothingRoles: TryOnClothingRole[];
  garmentAudience: string;
  ageGroup: string;
}) {
  const timeoutMs = Number(process.env.TRYON_CLOTHING_ANALYZE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${input.provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${input.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: input.provider.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是电商服装识别助手。只返回 JSON，不要输出解释。",
              "字段：cloth_type, desc, mainCategory, subcategories, genderType, ageRange, slot, fit, confidence。",
              "subcategories 必须尽量使用系统 code：single_fitted_top, single_loose_top, fitted_top, loose_top, long_pants, shorts, aline_skirt, dress, swimsuit 等。",
              "slot 只能是 upper/lower/single/outer/intimate/functional；fit 只能是 loose/fitted/regular。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `识别这些服装图。clothing_mode=${input.clothingMode}, clothing_roles=${input.clothingRoles.join(",") || "none"}, garment_audience=${input.garmentAudience}, age_group=${input.ageGroup}。`,
                  buildClothingRoleAnalysisInstruction(input.clothingRoles),
                  "用户上传槽位是强约束：如果图片里同时有人、脸、上衣、下装或背景，只识别槽位对应的服装区域，不要因为画面中脸/上身更显眼而改判槽位。",
                  "如果用户槽位与视觉主体冲突，slot 必须优先沿用用户槽位；desc 可以说明实际观察到的对应区域细节。",
                  "如果是条纹背心、吊带、修身上衣且用户槽位不是 lower，优先 single_fitted_top，并兼容 fitted_top。",
                ].filter(Boolean).join("\n"),
              },
              ...input.clothingUrls.map((url) => ({
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
      throw new TryOnVisionProviderError(
        getHttpFallbackReason(response.status),
        typeof raw?.error?.message === "string" ? raw.error.message : `Provider HTTP ${response.status}`,
        response.status
      );
    }
    const content = extractMessageContent(raw);
    if (!content.trim()) {
      throw new TryOnVisionProviderError("provider_empty_content", "Provider returned empty message content");
    }
    return {
      raw,
      parsed: parseJsonObject(content),
    };
  } finally {
    clearTimeout(timer);
  }
}

function getHttpFallbackReason(status: number) {
  if (status === 401) return "provider_http_401";
  if (status === 403) return "provider_http_403";
  if (status === 429) return "provider_http_429";
  return "provider_http_error";
}

function redactBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0];
  }
}

function getFallbackClothType(input: {
  clothingMode: string;
  clothingRoles: TryOnClothingRole[];
}) {
  const primaryRole = input.clothingRoles[0];
  if (primaryRole === "lower") return "lower garment pants or skirt";
  if (primaryRole === "upper") return "upper garment";
  if (primaryRole === "single") return "dress or one-piece garment";
  return input.clothingMode === "multi" ? "upper garment" : "dress or one-piece garment";
}

function buildClothingRoleAnalysisInstruction(roles: TryOnClothingRole[]) {
  if (!roles.length) return "";
  const roleLines = roles.map((role, index) => {
    const imageRef = `image ${index + 1}`;
    const label = TRYON_CLOTHING_ROLE_LABELS[role] || role;
    if (role === "lower") {
      return `${imageRef} was placed by the user in the ${label} slot. Analyze only the lower garment: pants, shorts, skirt, waistband, pockets, leg opening, hem length, fabric, color, seams, cargo pockets, pleats, and lower-body construction. Ignore any visible head, face, hair, upper top, arms, background, logo, or model identity. Return slot="lower" unless there is no lower garment at all.`;
    }
    if (role === "upper") {
      return `${imageRef} was placed by the user in the ${label} slot. Analyze only the upper garment: top, shirt, vest, jacket, neckline, sleeves, shoulder line, hem, fabric, color, print, seams, and buttons. Ignore any visible face, lower garment, shoes, background, or model identity. Return slot="upper" unless there is no upper garment at all.`;
    }
    if (role === "single") {
      return `${imageRef} was placed by the user in the ${label} slot. Analyze the one-piece or complete garment as the source. Ignore the model identity, pose, face, background, and non-garment context.`;
    }
    return `${imageRef} was placed by the user in the ${label} slot. Use that slot as the primary interpretation and ignore unrelated person or background content.`;
  });
  return roleLines.join("\n");
}

function applyUserRoleToClothingAnalysis(
  analysis: TryOnClothingAnalysis,
  roles: TryOnClothingRole[],
  imageCount: number
): TryOnClothingAnalysis {
  if (imageCount !== 1) return analysis;
  const role = roles[0];
  if (role !== "upper" && role !== "lower" && role !== "single") return analysis;

  if (role === "lower") {
    const text = `${analysis.clothTypeRaw} ${analysis.desc} ${analysis.mainCategory || ""} ${analysis.subcategories.join(" ")}`.toLowerCase();
    const isSkirt = /skirt|裙/.test(text);
    return {
      ...analysis,
      slot: "lower",
      mainCategory: isSkirt ? "bottom_skirt" : "bottom_pants",
      subcategories: analysis.subcategories.some((code) => code === "shorts" || code === "long_pants" || code === "overalls" || code.includes("skirt"))
        ? analysis.subcategories
        : [isSkirt ? "aline_skirt" : "long_pants"],
      clothTypeRaw: analysis.clothTypeRaw || (isSkirt ? "lower skirt garment" : "lower pants garment"),
      raw: {
        provider: analysis.raw ?? null,
        userRoleGuard: { role, reason: "single image uploaded into explicit lower slot" },
      },
    };
  }

  if (role === "upper") {
    return {
      ...analysis,
      slot: analysis.slot === "outer" ? "outer" : "upper",
      mainCategory: analysis.slot === "outer" || analysis.mainCategory === "outerwear" ? "outerwear" : "single_piece_top",
      subcategories: analysis.subcategories.some((code) => code.includes("top") || code.includes("coat") || code.includes("jacket"))
        ? analysis.subcategories
        : ["single_fitted_top"],
      clothTypeRaw: analysis.clothTypeRaw || "upper garment",
      raw: {
        provider: analysis.raw ?? null,
        userRoleGuard: { role, reason: "single image uploaded into explicit upper slot" },
      },
    };
  }

  return {
    ...analysis,
    slot: "single",
    mainCategory: analysis.mainCategory || "dress",
    clothTypeRaw: analysis.clothTypeRaw || "dress or one-piece garment",
    raw: {
      provider: analysis.raw ?? null,
      userRoleGuard: { role, reason: "single image uploaded into explicit one-piece slot" },
    },
  };
}

async function readCachedAnalysis(cacheKey: string) {
  try {
    const { data, error } = await getAdminClient()
      .from("tryon_clothing_analysis_cache")
      .select("main_category,subcategories,cloth_type_raw,description,gender_type,age_range,slot,fit,confidence,provider,raw_response")
      .eq("image_url_hash", cacheKey)
      .maybeSingle();
    if (error || !data) return null;
    if (data.provider !== "yunwu") return null;
    const cachedConfidence = Number(data.confidence);
    if (!Number.isFinite(cachedConfidence) || cachedConfidence < CLOTHING_ANALYSIS_CACHE_MIN_CONFIDENCE) return null;
    const rawRecord = toRecord(data.raw_response);
    const parsedRecord = toRecord(rawRecord.parsed ?? rawRecord);
    return normalizeTryOnClothingAnalysis({
      ...parsedRecord,
      mainCategory: data.main_category,
      subcategories: data.subcategories,
      clothTypeRaw: data.cloth_type_raw,
      desc: data.description,
      genderType: data.gender_type,
      ageRange: data.age_range,
      slot: data.slot,
      fit: data.fit,
      confidence: Number(data.confidence) || 0,
      raw: data.raw_response,
    });
  } catch {
    return null;
  }
}

async function writeCachedAnalysis(input: {
  cacheKey: string;
  clothingUrls: string[];
  clothingMode: string;
  clothingRoles: TryOnClothingRole[];
  garmentAudience: string;
  ageGroup: string;
  analysis: TryOnClothingAnalysis;
  provider: string;
  model: string;
  rawResponse: unknown;
}) {
  try {
    await getAdminClient()
      .from("tryon_clothing_analysis_cache")
      .upsert({
        image_url_hash: input.cacheKey,
        clothing_urls: input.clothingUrls,
        clothing_mode: input.clothingMode,
        garment_audience: input.garmentAudience,
        age_group: input.ageGroup,
        main_category: input.analysis.mainCategory,
        subcategories: input.analysis.subcategories,
        cloth_type_raw: input.analysis.clothTypeRaw,
        description: input.analysis.desc,
        gender_type: input.analysis.genderType,
        age_range: input.analysis.ageRange,
        slot: input.analysis.slot,
        fit: input.analysis.fit,
        confidence: input.analysis.confidence,
        provider: input.provider,
        model: input.model,
        raw_response: { provider: input.rawResponse || null, parsed: input.analysis },
      }, { onConflict: "image_url_hash" });
  } catch {
    // Cache is an optimization; recommendation must still work without it.
  }
}

function shouldCacheClothingAnalysis(result: ClothingAnalysisResult) {
  if (result.source !== "yunwu") return false;
  if (result.analysis.confidence < CLOTHING_ANALYSIS_CACHE_MIN_CONFIDENCE) return false;
  return Boolean(result.analysis.mainCategory || result.analysis.subcategories.length || result.analysis.clothTypeRaw);
}

function buildAnalysisCacheKey(value: {
  clothingUrls: string[];
  clothingMode: string;
  clothingRoles: TryOnClothingRole[];
  garmentAudience: string;
  ageGroup: string;
}) {
  return createHash("sha256").update(JSON.stringify({
    ...value,
    clothingUrls: value.clothingUrls.map((url) => normalizeCacheUrl(url)),
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

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
