import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTryOnClothingAnalysis,
  type TryOnClothingAnalysis,
} from "@/lib/tryon-reference-config";
import { normalizeTryOnAgeGroup, normalizeTryOnGarmentAudience } from "@/lib/tryon-prompt";
import { normalizeTryOnClothingMode } from "@/lib/tryon-upload-rules";

const DEFAULT_MODEL = "gpt-5-nano";
const DEFAULT_BASE_URL = "https://yunwu.ai/v1";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_ANALYZE_IMAGES = 4;

type ClothingAnalyzeRequest = {
  clothing_urls?: unknown;
  clothing_mode?: unknown;
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
  const garmentAudience = normalizeTryOnGarmentAudience(typeof body.garment_audience === "string" ? body.garment_audience : undefined);
  const ageGroup = normalizeTryOnAgeGroup(typeof body.age_group === "string" ? body.age_group : undefined);
  const cacheKey = buildAnalysisCacheKey({ clothingUrls, clothingMode, garmentAudience, ageGroup });

  const cached = await readCachedAnalysis(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      source: "cache",
      analysis: cached,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const model = process.env.TRYON_CLOTHING_ANALYZE_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.TRYON_CLOTHING_ANALYZE_API_KEY || process.env.LINGYA_API_KEY || "";
  const baseUrl = normalizeOpenAiBaseUrl(process.env.TRYON_CLOTHING_ANALYZE_BASE_URL || process.env.LINGYA_BASE_URL || DEFAULT_BASE_URL);

  let analysis: TryOnClothingAnalysis;
  let source: "yunwu" | "fallback" = "fallback";
  let rawResponse: unknown = null;

  if (apiKey) {
    try {
      const result = await requestYunwuClothingAnalysis({
        apiKey,
        baseUrl,
        model,
        clothingUrls,
        clothingMode,
        garmentAudience,
        ageGroup,
      });
      rawResponse = result.raw;
      analysis = normalizeTryOnClothingAnalysis({
        ...result.parsed,
        genderType: result.parsed.genderType || garmentAudience,
        ageRange: result.parsed.ageRange || ageGroup,
        raw: result.raw,
      });
      source = "yunwu";
    } catch (error) {
      console.warn("[tryon/analyze-clothing] provider fallback:", error);
      analysis = normalizeTryOnClothingAnalysis({
        cloth_type: clothingMode === "multi" ? "upper garment" : "dress or one-piece garment",
        desc: "",
        genderType: garmentAudience,
        ageRange: ageGroup,
      });
    }
  } else {
    analysis = normalizeTryOnClothingAnalysis({
      cloth_type: clothingMode === "multi" ? "upper garment" : "dress or one-piece garment",
      desc: "",
      genderType: garmentAudience,
      ageRange: ageGroup,
    });
  }

  await writeCachedAnalysis({
    cacheKey,
    clothingUrls,
    clothingMode,
    garmentAudience,
    ageGroup,
    analysis,
    provider: source,
    model,
    rawResponse,
  });

  return NextResponse.json({
    ok: true,
    cached: false,
    source,
    analysis,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function requestYunwuClothingAnalysis(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  clothingUrls: string[];
  clothingMode: string;
  garmentAudience: string;
  ageGroup: string;
}) {
  const timeoutMs = Number(process.env.TRYON_CLOTHING_ANALYZE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
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
                text: `识别这些服装图。clothing_mode=${input.clothingMode}, garment_audience=${input.garmentAudience}, age_group=${input.ageGroup}。如果是条纹背心、吊带、修身上衣，优先 single_fitted_top，并兼容 fitted_top。`,
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

async function readCachedAnalysis(cacheKey: string) {
  try {
    const { data, error } = await getAdminClient()
      .from("tryon_clothing_analysis_cache")
      .select("main_category,subcategories,cloth_type_raw,description,gender_type,age_range,slot,fit,confidence,raw_response")
      .eq("image_url_hash", cacheKey)
      .maybeSingle();
    if (error || !data) return null;
    return normalizeTryOnClothingAnalysis({
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
        raw_response: input.rawResponse || input.analysis.raw || {},
      }, { onConflict: "image_url_hash" });
  } catch {
    // Cache is an optimization; recommendation must still work without it.
  }
}

function buildAnalysisCacheKey(value: {
  clothingUrls: string[];
  clothingMode: string;
  garmentAudience: string;
  ageGroup: string;
}) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
