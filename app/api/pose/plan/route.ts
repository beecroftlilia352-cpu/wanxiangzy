import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig, getLlmFallbackConfigs } from "@/lib/api/llm-provider";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import { normalizePoseSeriesStyle } from "@/lib/module-style-presets";
import { normalizePoseVisualAnalysis } from "@/lib/pose-analysis";
import {
  POSE_PLAN_VERSION,
  buildFallbackPosePlan,
  buildPosePlanCacheKey,
  getPoseStylePolicy,
  normalizePosePlan,
  type PosePlan,
} from "@/lib/pose-plan";

const DEFAULT_TIMEOUT_MS = 20_000;
const POSE_PLAN_SUCCESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const POSE_PLAN_FALLBACK_CACHE_TTL_MS = 60 * 1000;
const POSE_PLAN_CACHE_MAX_ENTRIES = 300;

type PosePlanSource = "vision_plan" | "fallback";
type PosePlanFallbackReason =
  | "user_custom"
  | "missing_pose_analysis"
  | "low_pose_analysis_confidence"
  | "missing_model_config"
  | "provider_error"
  | "invalid_model_response"
  | "low_plan_confidence";
type PosePlanResult = {
  source: PosePlanSource;
  posePlan: PosePlan;
  rawResponse: unknown;
  reason?: PosePlanFallbackReason;
  reasonText?: string;
};

const POSE_PLAN_FALLBACK_REASON_TEXT: Record<PosePlanFallbackReason, string> = {
  user_custom: "自定义姿势不调用 AI 规划",
  missing_pose_analysis: "主图视觉识别缺失，无法做图像相关姿势规划",
  low_pose_analysis_confidence: "主图视觉识别置信度过低，已收敛到保守姿势",
  missing_model_config: "姿势规划 text 模型未配置",
  provider_error: "AI 姿势规划暂不可用，已基于主图视觉识别生成可用姿势方案",
  invalid_model_response: "姿势规划模型返回结构无效，已使用保守方案",
  low_plan_confidence: "姿势规划置信度过低，已使用保守方案",
};

const posePlanCache = new Map<string, {
  expiresAt: number;
  result: PosePlanResult;
}>();
const posePlanInflight = new Map<string, Promise<PosePlanResult>>();

type PosePlanRequest = {
  main_image_url?: unknown;
  pose_analysis?: unknown;
  poseAnalysis?: unknown;
  pose_style?: unknown;
  poseStyle?: unknown;
  output_mode?: unknown;
  outputMode?: unknown;
  prompt?: unknown;
  force?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.posePlan);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => ({})) as PosePlanRequest;
  const mainImageUrl = typeof body.main_image_url === "string" ? body.main_image_url.trim() : "";
  if (!mainImageUrl) return NextResponse.json({ error: "请先上传主图" }, { status: 400 });

  const poseStyle = normalizePoseSeriesStyle(body.pose_style || body.poseStyle);
  const outputMode = body.output_mode === "separate" || body.outputMode === "separate" ? "separate" : "grid";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const poseAnalysis = normalizePoseVisualAnalysis(body.pose_analysis ?? body.poseAnalysis);
  const force = body.force === true;

  if (poseStyle === "user_custom") {
    const fallback = buildFallbackPosePlan({ poseAnalysis, poseStyle, outputMode, prompt });
    return NextResponse.json({
      ok: true,
      cached: false,
      source: "fallback",
      reason: "user_custom",
      reasonText: POSE_PLAN_FALLBACK_REASON_TEXT.user_custom,
      posePlan: fallback,
      raw: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const cacheKey = createHash("sha256").update(buildPosePlanCacheKey({
    mainImageUrl,
    poseAnalysis,
    poseStyle,
    outputMode,
    prompt,
  })).digest("hex");

  const cached = force ? null : readPosePlanMemoryCache(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      source: cached.source,
      reason: cached.reason,
      reasonText: cached.reasonText,
      posePlan: cached.posePlan,
      raw: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const configs = getPosePlanLlmConfigs();

  let inflightRequest = posePlanInflight.get(cacheKey);
  if (!inflightRequest || force) {
    const nextRequest = runPosePlan({
      configs,
      poseAnalysis,
      poseStyle,
      outputMode,
      prompt,
    });
    posePlanInflight.set(cacheKey, nextRequest);
    void nextRequest.finally(() => {
      if (posePlanInflight.get(cacheKey) === nextRequest) {
        posePlanInflight.delete(cacheKey);
      }
    });
    inflightRequest = nextRequest;
  }

  const result = await inflightRequest;
  writePosePlanMemoryCache(cacheKey, result);

  return NextResponse.json({
    ok: true,
    cached: false,
    source: result.source,
    reason: result.reason,
    reasonText: result.reasonText,
    posePlan: result.posePlan,
    raw: result.rawResponse,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function runPosePlan(input: {
  configs: Array<{
    provider: "xiaomi" | "lingya";
    apiKey: string;
    baseUrl: string;
    model: string;
  }>;
  poseAnalysis: ReturnType<typeof normalizePoseVisualAnalysis>;
  poseStyle: ReturnType<typeof normalizePoseSeriesStyle>;
  outputMode: "grid" | "separate";
  prompt: string;
}): Promise<PosePlanResult> {
  const fallback = buildFallbackPosePlan(input);
  if (!input.poseAnalysis) {
    return buildFallbackResult(fallback, "missing_pose_analysis");
  }
  if (input.poseAnalysis.confidence < 0.2) {
    return buildFallbackResult(fallback, "low_pose_analysis_confidence");
  }

  const configs = input.configs.filter((config) => config.apiKey && config.baseUrl && config.model);
  if (!configs.length) {
    return buildFallbackResult(fallback, "missing_model_config");
  }

  let lastReason: PosePlanFallbackReason = "provider_error";
  let lastRaw: unknown = null;
  try {
    for (const config of configs) {
      const attempts = [true, false];
      for (const useJsonMode of attempts) {
        try {
          const result = await requestPosePlan({ ...input, ...config, useJsonMode });
          lastRaw = result.raw;
          const parsedModelPlan = extractModelPosePlan(result.parsed);
          if (!isModelPosePlanUsable(parsedModelPlan)) {
            lastReason = "invalid_model_response";
            continue;
          }
          const parsedPlan = normalizePosePlan(parsedModelPlan, input);
          if (getAverageConfidence(parsedPlan) < 0.45) {
            lastReason = "low_plan_confidence";
            continue;
          }
          return {
            source: "vision_plan",
            posePlan: parsedPlan,
            rawResponse: result.raw,
          };
        } catch (error) {
          lastReason = "provider_error";
          console.warn("[pose/plan] provider attempt failed:", {
            provider: config.provider,
            model: config.model,
            jsonMode: useJsonMode,
            error,
          });
        }
      }
    }
  } catch (error) {
    console.warn("[pose/plan] provider fallback:", error);
  }
  return buildFallbackResult(fallback, lastReason, lastRaw);
}

async function requestPosePlan(input: {
  provider: "xiaomi" | "lingya";
  apiKey: string;
  baseUrl: string;
  model: string;
  useJsonMode: boolean;
  poseAnalysis: ReturnType<typeof normalizePoseVisualAnalysis>;
  poseStyle: ReturnType<typeof normalizePoseSeriesStyle>;
  outputMode: "grid" | "separate";
  prompt: string;
}) {
  const timeoutMs = Number(process.env.POSE_PLAN_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  try {
    const policy = getPoseStylePolicy(input.poseStyle);
    const response = await fetch(getChatCompletionsUrl({
      provider: input.provider,
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
        temperature: 0.2,
        ...(input.useJsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          {
            role: "system",
            content: [
              "你是商业时装姿势规划助手。只返回 JSON，不要输出解释。",
              "你不能写最终生成 prompt，只能输出结构化 posePlan。",
              `返回 { posePlan: { version: \"${POSE_PLAN_VERSION}\", style, outputMode, edited:false, slots:[...] } }。`,
              "slots 必须正好 4 个，每个字段：index, poseName, bodyAction, handAction, headDirection, cameraFraming, garmentVisibilityRule, avoidRules, confidence。",
              "confidence 必须是 0 到 1 的数字，例如 0.82；不要返回 high、medium、low 或百分比字符串。",
              "所有用户可见字段必须使用简体中文，包括 poseName、bodyAction、handAction、headDirection、cameraFraming、garmentVisibilityRule、avoidRules；不要输出英文姿势名、英文动作句或英文风险词。",
              "poseName 用 4-12 个中文字，bodyAction/handAction/headDirection/cameraFraming/garmentVisibilityRule 用短中文短句。",
              "姿势必须基于 poseAnalysis 的性别表达、服装、手脚可见性和输入裁切逻辑规划。",
              "不要规划会改变性别表达、身体骨架、脸、年龄感或服装结构的动作。",
              "如果 bodyCrop 是 full_body 或 three_quarter，可按目标姿势规划全身、近全身、七分身或偏半身商业构图；不要把源图画幅当成固定模板。",
              "如果 bodyCrop 是 upper_body，不要规划脚步、鞋履或全身大动作。",
              "如果 bodyCrop 是 lower_body，不要规划头部、脸部、表情或上半身动作。",
              "如果 bodyCrop 是 closeup，只规划局部姿态、细节角度和近景构图。",
              "full_body/three_quarter 人像的 4 个 slot 需要有克制但可见的表情或视线差异，不要四张同一僵硬表情。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `poseStyle=${input.poseStyle}`,
              `outputMode=${input.outputMode}`,
              `stylePolicy=${JSON.stringify(policy)}`,
              `poseAnalysis=${JSON.stringify(input.poseAnalysis)}`,
              `userPrompt=${input.prompt.slice(0, 800)}`,
              "规划 4 个自然可信、彼此不同、适合该风格、服装展示和商业构图变化的时装姿势。",
            ].join("\n"),
          },
        ],
        max_tokens: 1200,
      }),
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof raw?.error?.message === "string" ? raw.error.message : `pose plan ${response.status}`);
    }
    return {
      raw,
      parsed: parseJsonObject(extractMessageContent(raw)),
    };
  } finally {
    clearTimeout(timer);
  }
}

function readPosePlanMemoryCache(cacheKey: string) {
  const cached = posePlanCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    posePlanCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function writePosePlanMemoryCache(cacheKey: string, result: PosePlanResult) {
  if (posePlanCache.size >= POSE_PLAN_CACHE_MAX_ENTRIES) {
    const oldestKey = posePlanCache.keys().next().value;
    if (oldestKey) posePlanCache.delete(oldestKey);
  }
  posePlanCache.set(cacheKey, {
    expiresAt: Date.now() + (result.source === "fallback" ? POSE_PLAN_FALLBACK_CACHE_TTL_MS : POSE_PLAN_SUCCESS_CACHE_TTL_MS),
    result,
  });
}

function getPosePlanLlmConfigs() {
  const primary = getLlmConfig("text");
  const hasOverride = Boolean(process.env.POSE_PLAN_API_KEY || process.env.POSE_PLAN_BASE_URL || process.env.POSE_PLAN_MODEL);
  if (hasOverride) {
    return [{
      provider: primary.provider,
      apiKey: process.env.POSE_PLAN_API_KEY || primary.apiKey,
      baseUrl: normalizeOpenAiCompatibleBaseUrl(process.env.POSE_PLAN_BASE_URL || primary.baseUrl),
      model: process.env.POSE_PLAN_MODEL || primary.model,
    }];
  }
  const configs = [
    ...getLlmFallbackConfigs("text"),
    // Pose planning is a text-only task, but many deployed vision/chat models
    // are also fully chat-compatible. Including the vision config prevents a
    // valid main-image analysis setup from falling back only because the text
    // model env is missing, unsupported, or temporarily unhealthy.
    ...getLlmFallbackConfigs("vision"),
  ].map((config) => ({
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: normalizeOpenAiCompatibleBaseUrl(config.baseUrl),
    model: config.model,
  }));
  const seen = new Set<string>();
  return configs.filter((config) => {
    const key = `${config.provider}:${config.baseUrl}:${config.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFallbackResult(
  posePlan: PosePlan,
  reason: PosePlanFallbackReason,
  rawResponse: unknown = null
): PosePlanResult {
  return {
    source: "fallback",
    posePlan,
    rawResponse,
    reason,
    reasonText: POSE_PLAN_FALLBACK_REASON_TEXT[reason],
  };
}

function extractModelPosePlan(parsed: any) {
  if (Array.isArray(parsed)) return parsed;
  return parsed?.posePlan ?? parsed?.plan ?? parsed?.result ?? parsed?.data ?? parsed;
}

function isModelPosePlanUsable(plan: any) {
  const slots = Array.isArray(plan)
    ? plan
    : Array.isArray(plan?.slots)
      ? plan.slots
      : Array.isArray(plan?.items)
        ? plan.items
        : Array.isArray(plan?.poses)
          ? plan.poses
          : Array.isArray(plan?.poseSlots)
            ? plan.poseSlots
            : Array.isArray(plan?.["姿势列表"])
              ? plan["姿势列表"]
              : [];
  return slots.length >= 4;
}

function getAverageConfidence(plan: PosePlan) {
  return plan.slots.reduce((sum, slot) => sum + slot.confidence, 0) / Math.max(plan.slots.length, 1);
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
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
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
