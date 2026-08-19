import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { executeLlmChatRouted } from "@/lib/api/llm-routing.server";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { normalizePoseSeriesStyle } from "@/lib/module-style-presets";
import { normalizePoseVisualAnalysis } from "@/lib/pose-analysis";
import {
  POSE_PLAN_ANGLE_LABELS,
  POSE_PLAN_VERSION,
  buildFallbackPosePlan,
  buildPosePlanCacheKey,
  getPoseAngleTotal,
  getPoseStylePolicy,
  normalizePoseAngleCounts,
  normalizePosePlan,
  normalizePosePlanCount,
  type PosePlan,
  type PosePlanAngle,
} from "@/lib/pose-plan";

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
  pose_count?: unknown;
  poseCount?: unknown;
  angle_counts?: unknown;
  angleCounts?: unknown;
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
  const angleCounts = normalizePoseAngleCounts(readAngleCountsInput(body.angle_counts ?? body.angleCounts));
  const poseCount = normalizePosePlanCount(body.pose_count ?? body.poseCount ?? getPoseAngleTotal(angleCounts));
  const force = body.force === true;

  if (poseStyle === "user_custom") {
    const fallback = buildFallbackPosePlan({ poseAnalysis, poseStyle, outputMode, prompt, poseCount, angleCounts });
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
    poseCount,
    angleCounts,
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

  let inflightRequest = posePlanInflight.get(cacheKey);
  if (!inflightRequest || force) {
    const nextRequest = runPosePlan({
      poseAnalysis,
      poseStyle,
      outputMode,
      poseCount,
      angleCounts,
      prompt,
    });
    posePlanInflight.set(cacheKey, nextRequest);
    void nextRequest.finally(() => {
      if (posePlanInflight.get(cacheKey) === nextRequest) {
        posePlanInflight.delete(cacheKey);
      }
    }).catch(() => undefined);
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
  poseAnalysis: ReturnType<typeof normalizePoseVisualAnalysis>;
  poseStyle: ReturnType<typeof normalizePoseSeriesStyle>;
  outputMode: "grid" | "separate";
  poseCount: number;
  angleCounts: ReturnType<typeof normalizePoseAngleCounts>;
  prompt: string;
}): Promise<PosePlanResult> {
  const fallback = buildFallbackPosePlan(input);
  if (!input.poseAnalysis) {
    return buildFallbackResult(fallback, "missing_pose_analysis");
  }
  if (input.poseAnalysis.confidence < 0.2) {
    return buildFallbackResult(fallback, "low_pose_analysis_confidence");
  }

  let lastReason: PosePlanFallbackReason = "provider_error";
  let lastRaw: unknown = null;
  try {
    for (const useJsonMode of [true, false]) {
      try {
        const result = await requestPosePlan({ ...input, useJsonMode });
        lastRaw = result.raw;
        const parsedModelPlan = extractModelPosePlan(result.parsed);
        if (!isModelPosePlanUsable(parsedModelPlan, input.poseCount)) {
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
        console.warn("[pose/plan] control-plane attempt failed:", { jsonMode: useJsonMode, error });
      }
    }
  } catch (error) {
    console.warn("[pose/plan] provider fallback:", error);
  }
  return buildFallbackResult(fallback, lastReason, lastRaw);
}

async function requestPosePlan(input: {
  useJsonMode: boolean;
  poseAnalysis: ReturnType<typeof normalizePoseVisualAnalysis>;
  poseStyle: ReturnType<typeof normalizePoseSeriesStyle>;
  outputMode: "grid" | "separate";
  poseCount: number;
  angleCounts: ReturnType<typeof normalizePoseAngleCounts>;
  prompt: string;
}) {
  const policy = getPoseStylePolicy(input.poseStyle);
  const angleInstruction = formatAngleCounts(input.angleCounts);
  const completion = await executeLlmChatRouted({
    kind: "text",
    body: {
        temperature: 0.2,
        ...(input.useJsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          {
            role: "system",
            content: [
              "你是商业时装姿势规划助手。只返回 JSON，不要输出解释。",
              "你不能写最终生成 prompt，只能输出结构化 posePlan。",
              `返回 { posePlan: { version: "${POSE_PLAN_VERSION}", style, outputMode, edited:false, slots:[...] } }。`,
              `slots 必须正好 ${input.poseCount} 个，每个字段：index, angle, poseName, bodyAction, handAction, headDirection, cameraFraming, garmentVisibilityRule, avoidRules, confidence。`,
              `angle 只能是 front、side、back、detail、garment、seated；角度数量必须符合：${angleInstruction}。`,
              "angle=garment 是服饰/配饰细节：该 slot 必须无头无脸，headDirection 必须为空字符串，cameraFraming 只拍领口、袖口、腰线、下摆、包袋或鞋履等局部特写，不要规划表情、视线、脸部动作或完整人像。",
              "angle=seated 是坐姿：规划正坐、叠腿或靠坐等自然坐姿，坐姿不改变服装结构和版型。",
              "confidence 必须是 0 到 1 的数字，例如 0.82；不要返回 high、medium、low 或百分比字符串。",
              "所有用户可见字段必须使用简体中文，包括 poseName、bodyAction、handAction、headDirection、cameraFraming、garmentVisibilityRule、avoidRules；不要输出英文姿势名、英文动作句或英文风险词。",
              "poseName 用 4-12 个中文字，bodyAction/handAction/headDirection/cameraFraming/garmentVisibilityRule 用短中文短句。",
              "姿势必须基于 poseAnalysis 的性别表达、服装、手脚可见性和输入裁切逻辑规划。",
              "不要规划会改变性别表达、身体骨架、脸、年龄感或服装结构的动作。",
              "poseAnalysis.headVisible=false 或 poseAnalysis.faceVisible=false 时，所有 slot 的 headDirection 必须为空字符串，不要规划表情、视线、看镜头、回眸、头部方向或脸部动作。",
              "如果 bodyCrop 是 full_body 或 three_quarter，可按目标姿势规划全身、近全身、七分身或偏半身商业构图；不要把源图画幅当成固定模板。",
              "如果 bodyCrop 是 upper_body，不要规划脚步、鞋履或全身大动作。",
              "如果 bodyCrop 是 lower_body，不要规划头部、脸部、表情、视线、回眸、完整上半身动作或完整人像构图；姿势只围绕腰胯、腿部、膝部、脚步、裤脚/裙摆、可见手臂和包袋变化。",
              "如果 bodyCrop 是 closeup，只规划局部姿态、细节角度和近景构图。",
              `full_body/three_quarter 人像的 ${input.poseCount} 个 slot 需要有克制但可见的表情或视线差异，不要多张同一僵硬表情。`,
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `poseStyle=${input.poseStyle}`,
              `outputMode=${input.outputMode}`,
              `poseCount=${input.poseCount}`,
              `angleCounts=${JSON.stringify(input.angleCounts)}`,
              `stylePolicy=${JSON.stringify(policy)}`,
              `poseAnalysis=${JSON.stringify(input.poseAnalysis)}`,
              `userPrompt=${input.prompt.slice(0, 800)}`,
              `规划 ${input.poseCount} 个自然可信、彼此不同、适合该风格、服装展示和商业构图变化的时装姿势。`,
            ].join("\n"),
          },
        ],
        max_tokens: Math.min(1800, 700 + input.poseCount * 160),
    },
  });
  return {
    raw: completion.data,
    parsed: parseJsonObject(extractMessageContent(completion.data)),
  };
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

function extractModelPosePlan(parsed: unknown) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return parsed;
  const record = parsed as Record<string, unknown>;
  return record.posePlan ?? record.plan ?? record.result ?? record.data ?? parsed;
}

function isModelPosePlanUsable(plan: unknown, minSlots = 4) {
  const record = plan && typeof plan === "object" && !Array.isArray(plan)
    ? plan as Record<string, unknown>
    : undefined;
  const slots = Array.isArray(plan)
    ? plan
    : Array.isArray(record?.slots)
      ? record.slots
      : Array.isArray(record?.items)
        ? record.items
        : Array.isArray(record?.poses)
          ? record.poses
          : Array.isArray(record?.poseSlots)
            ? record.poseSlots
            : Array.isArray(record?.["姿势列表"])
              ? record["姿势列表"]
              : [];
  return slots.length >= minSlots;
}

function formatAngleCounts(counts: ReturnType<typeof normalizePoseAngleCounts>) {
  return (Object.keys(POSE_PLAN_ANGLE_LABELS) as PosePlanAngle[])
    .filter((key) => counts[key] > 0)
    .map((key) => `${POSE_PLAN_ANGLE_LABELS[key]} ${counts[key]} 个`)
    .join("、") || "正面 1 个";
}

function readAngleCountsInput(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<PosePlanAngle, unknown>>
    : undefined;
}

function getAverageConfidence(plan: PosePlan) {
  return plan.slots.reduce((sum, slot) => sum + slot.confidence, 0) / Math.max(plan.slots.length, 1);
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

function parseJsonObject(content: string): unknown {
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
