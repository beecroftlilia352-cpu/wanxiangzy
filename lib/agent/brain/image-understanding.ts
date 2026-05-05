import { getImageRoleLabel, type AgentImageInput } from "@/lib/agent/decision-utils";
import type { AgentBrainTrace, ImageUnderstandingItem, ImageUnderstandingResult } from "@/lib/agent/brain/types";
import { callBrainJson } from "@/lib/agent/brain/llm-json";
import { addTraceEvent } from "@/lib/agent/brain/trace";

export async function understandImages(params: {
  userText: string;
  images: AgentImageInput[];
  trace: AgentBrainTrace;
}): Promise<ImageUnderstandingResult | null> {
  if (!params.images.length) return null;

  const fallback = buildFallbackUnderstanding(params.images);
  const parsed = await callBrainJson({
    kind: "vision",
    stage: "image_understanding",
    trace: params.trace,
    temperature: 0.1,
    maxTokens: 1400,
    system: [
      "You are an image understanding agent for a fashion ecommerce visual workflow product.",
      "Return ONLY JSON. No markdown.",
      "Do not decide the final workflow. Only describe the uploaded images and likely roles.",
      "Respect explicit image roles from the UI if provided.",
    ].join("\n"),
    text: [
      "Output schema:",
      JSON.stringify({
        summary: "short Chinese summary",
        confidence: 0.0,
        images: [{
          index: 1,
          role: "person|clothing|product|background|style|source|reference|face|unknown",
          roleConfidence: 0.0,
          subject: "string",
          garment: "string",
          background: "string",
          styleTags: ["string"],
          risks: ["string"],
        }],
      }),
      "",
      "Input image metadata:",
      params.images.map((img) => `图${img.index}: explicitRole=${getImageRoleLabel(img.role) || img.role || "auto"} file=${img.fileName || ""}`).join("\n"),
      "",
      `User request: ${params.userText || "用户只上传了图片，等待分析或操作建议。"}`,
    ].join("\n"),
    images: params.images.map((img) => img.url),
  });

  const normalized = normalizeUnderstanding(parsed, params.images);
  if (!normalized) {
    addTraceEvent(params.trace, {
      stage: "image_understanding",
      status: "fallback",
      summary: "Vision understanding unavailable; used explicit roles and order-based fallback.",
    });
    return fallback;
  }

  return {
    ...normalized,
    images: mergeExplicitRoles(normalized.images, fallback.images),
  };
}

function normalizeUnderstanding(raw: Record<string, unknown> | null, images: AgentImageInput[]): ImageUnderstandingResult | null {
  if (!raw) return null;
  const rawItems = Array.isArray(raw.images) ? raw.images : [];
  const items = rawItems
    .map((item) => normalizeItem(item, images))
    .filter((item): item is ImageUnderstandingItem => Boolean(item));
  if (!items.length) return null;
  return {
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 400) : "已完成图片理解。",
    confidence: clamp(raw.confidence, 0.35, 0.95),
    source: "llm",
    images: items,
  };
}

function normalizeItem(value: unknown, images: AgentImageInput[]): ImageUnderstandingItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const index = Number(record.index);
  if (!Number.isFinite(index) || !images.some((img) => img.index === index)) return null;
  const role = normalizeRole(record.role);
  return {
    index,
    role,
    roleConfidence: clamp(record.roleConfidence, 0.2, 0.95),
    subject: stringOrUndefined(record.subject),
    garment: stringOrUndefined(record.garment),
    background: stringOrUndefined(record.background),
    styleTags: stringArray(record.styleTags).slice(0, 8),
    risks: stringArray(record.risks).slice(0, 6),
  };
}

function mergeExplicitRoles(items: ImageUnderstandingItem[], fallback: ImageUnderstandingItem[]) {
  return items.map((item) => {
    const explicit = fallback.find((fb) => fb.index === item.index && fb.roleConfidence >= 0.85);
    return explicit ? { ...item, role: explicit.role, roleConfidence: Math.max(item.roleConfidence, explicit.roleConfidence) } : item;
  });
}

function buildFallbackUnderstanding(images: AgentImageInput[]): ImageUnderstandingResult {
  return {
    summary: images.length === 1 ? "已收到 1 张图片，角色需要结合用户指令判断。" : `已收到 ${images.length} 张图片，将根据显式角色和图号关系判断用途。`,
    confidence: images.some((img) => img.role && img.role !== "auto") ? 0.72 : 0.5,
    source: "deterministic",
    images: images.map((img, order) => ({
      index: img.index,
      role: normalizeRole(img.role) || (order === 0 ? "source" : "reference"),
      roleConfidence: img.role && img.role !== "auto" ? 0.9 : 0.52,
      styleTags: [],
      risks: img.role && img.role !== "auto" ? [] : ["图片角色未显式指定，复杂任务需要确认图号关系。"],
    })),
  };
}

function normalizeRole(value: unknown): ImageUnderstandingItem["role"] {
  if (typeof value !== "string") return "unknown";
  if (["person", "clothing", "product", "background", "style", "source", "reference", "face", "unknown"].includes(value)) {
    return value as ImageUnderstandingItem["role"];
  }
  if (value === "auto") return "unknown";
  return "unknown";
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function clamp(value: unknown, min: number, max: number) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num > 1 ? num / 100 : num));
}

