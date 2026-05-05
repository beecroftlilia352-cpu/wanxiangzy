import { getAdminClient } from "@/lib/supabase/admin";

export type AgentUserPreferences = {
  brandStyle?: string;
  styleNotes?: string[];
  negativeRules?: string[];
  outputDefaults?: {
    model?: string;
    aspectRatio?: string;
    imageSize?: string;
    count?: number;
    poseOutputMode?: "grid" | "separate";
  };
  learnedFromFeedback?: Array<{
    at: string;
    rating: "good" | "bad";
    reason?: string;
    tags?: string[];
  }>;
};

type PreferencePatch = Partial<AgentUserPreferences>;

const MAX_LIST_ITEMS = 20;

export async function getAgentUserPreferences(userId: string): Promise<AgentUserPreferences> {
  try {
    const { data, error } = await getAdminClient()
      .from("agent_user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[agent-memory] preference load skipped:", error.message);
      return {};
    }
    return normalizePreferences(data?.preferences);
  } catch (err) {
    console.warn("[agent-memory] preference load failed:", err instanceof Error ? err.message : String(err));
    return {};
  }
}

export async function upsertAgentUserPreferences(
  userId: string,
  patch: PreferencePatch,
  source: "feedback" | "manual" | "system" = "feedback"
) {
  const existing = await getAgentUserPreferences(userId);
  const next = mergeAgentUserPreferences(existing, patch);
  try {
    const { error } = await getAdminClient()
      .from("agent_user_preferences")
      .upsert({
        user_id: userId,
        preferences: {
          ...next,
          _meta: {
            lastSource: source,
            updatedAt: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (err) {
    console.warn("[agent-memory] preference upsert failed:", err instanceof Error ? err.message : String(err));
  }
  return next;
}

export function mergeAgentUserPreferences(
  existing: AgentUserPreferences,
  patch: PreferencePatch
): AgentUserPreferences {
  return {
    ...existing,
    ...patch,
    styleNotes: mergeStringList(existing.styleNotes, patch.styleNotes),
    negativeRules: mergeStringList(existing.negativeRules, patch.negativeRules),
    outputDefaults: {
      ...(existing.outputDefaults || {}),
      ...(patch.outputDefaults || {}),
    },
    learnedFromFeedback: [
      ...(patch.learnedFromFeedback || []),
      ...(existing.learnedFromFeedback || []),
    ].slice(0, MAX_LIST_ITEMS),
  };
}

export function extractPreferencePatchFromFeedback(params: {
  rating: "good" | "bad";
  reason?: string;
  tags?: string[];
}): PreferencePatch {
  const reason = (params.reason || "").trim();
  const tags = params.tags || [];
  const combined = `${reason}\n${tags.join("\n")}`;
  const negativeRules: string[] = [];
  const styleNotes: string[] = [];
  const outputDefaults: NonNullable<AgentUserPreferences["outputDefaults"]> = {};

  if (params.rating === "bad") {
    if (/详情页|淘宝|天猫|京东|长图/.test(combined)) {
      negativeRules.push("当用户要求详情页、长图、卖点图或参数图时，优先按电商详情页版式处理，不要改成种草图、街拍图或普通氛围照。");
    }
    if (/比例|画幅|构图|尺寸/.test(combined)) {
      negativeRules.push("优先尊重用户显式指定的比例、画幅和构图；没有明确要求时才按任务类型自动选择。");
    }
    if (/四宫格/.test(combined)) outputDefaults.poseOutputMode = "grid";
    if (/单独|每张|独立/.test(combined)) outputDefaults.poseOutputMode = "separate";
    if (/换脸|脸|不像|身份/.test(combined)) {
      negativeRules.push("涉及人物图时，必须优先保持同一人脸部身份、骨相、身体比例和服装结构稳定。");
    }
    if (/太死板|自由发挥|随机|创意/.test(combined)) {
      negativeRules.push("除非用户明确要求固定模板，否则风格、姿势和镜头应允许自然创作，不要套死板模板。");
    }
  }

  if (reason && /风格|品牌|质感|高级|轻奢|韩系|电商|杂志|lookbook/i.test(reason)) {
    styleNotes.push(reason.slice(0, 180));
  }

  return {
    negativeRules,
    styleNotes,
    outputDefaults: Object.keys(outputDefaults).length ? outputDefaults : undefined,
    learnedFromFeedback: [{
      at: new Date().toISOString(),
      rating: params.rating,
      reason: reason || undefined,
      tags,
    }],
  };
}

export function buildPreferencePrompt(preferences?: AgentUserPreferences | Record<string, unknown> | null) {
  const normalized = normalizePreferences(preferences);
  const lines: string[] = [];
  if (normalized.brandStyle) lines.push(`Brand style: ${normalized.brandStyle}`);
  if (normalized.styleNotes?.length) lines.push(`Style notes: ${normalized.styleNotes.slice(0, 8).join(" | ")}`);
  if (normalized.negativeRules?.length) lines.push(`Learned guardrails: ${normalized.negativeRules.slice(0, 10).join(" | ")}`);
  if (normalized.outputDefaults && Object.keys(normalized.outputDefaults).length) {
    lines.push(`Output defaults: ${JSON.stringify(normalized.outputDefaults)}`);
  }
  return lines.length ? lines.join("\n") : "No persistent user preferences yet.";
}

function normalizePreferences(value: unknown): AgentUserPreferences {
  if (!isPlainObject(value)) return {};
  const outputDefaults = isPlainObject(value.outputDefaults) ? value.outputDefaults : {};
  return {
    brandStyle: typeof value.brandStyle === "string" ? value.brandStyle : undefined,
    styleNotes: stringList(value.styleNotes),
    negativeRules: stringList(value.negativeRules),
    outputDefaults: {
      model: stringOrUndefined(outputDefaults.model),
      aspectRatio: stringOrUndefined(outputDefaults.aspectRatio),
      imageSize: stringOrUndefined(outputDefaults.imageSize),
      count: typeof outputDefaults.count === "number" ? outputDefaults.count : undefined,
      poseOutputMode: outputDefaults.poseOutputMode === "grid" || outputDefaults.poseOutputMode === "separate"
        ? outputDefaults.poseOutputMode
        : undefined,
    },
    learnedFromFeedback: Array.isArray(value.learnedFromFeedback)
      ? value.learnedFromFeedback.filter(isPlainObject).slice(0, MAX_LIST_ITEMS) as AgentUserPreferences["learnedFromFeedback"]
      : [],
  };
}

function mergeStringList(a?: string[], b?: string[]) {
  return Array.from(new Set([...(b || []), ...(a || [])].map((item) => item.trim()).filter(Boolean))).slice(0, MAX_LIST_ITEMS);
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, MAX_LIST_ITEMS) : [];
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
