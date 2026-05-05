import { normalizeWorkflowGenerationDefaults } from "@/lib/agent/workflow/model-capabilities";
import type { GenerationDefaults, WorkflowInputImage, WorkflowMode, WorkflowPlan } from "@/lib/agent/workflow/types";

export function normalizeWorkflowMode(value: unknown): WorkflowMode {
  return value === "chat" || value === "agent" || value === "auto" ? value : "auto";
}

export function normalizeWorkflowImages(value: unknown): WorkflowInputImage[] {
  if (!Array.isArray(value)) return [];
  const images: Array<WorkflowInputImage | null> = value
    .map((item, index): WorkflowInputImage | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url : typeof record.hostedUrl === "string" ? record.hostedUrl : "";
      if (!url) return null;
      return {
        index: Number(record.index || index + 1),
        url,
        role: typeof record.role === "string" ? record.role as WorkflowInputImage["role"] : "auto",
        fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      };
    });
  return images.filter((item): item is WorkflowInputImage => Boolean(item));
}

export function normalizeGenerationDefaults(value: unknown): GenerationDefaults {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalized = normalizeWorkflowGenerationDefaults({
    model: record.model,
    aspectRatio: record.aspectRatio || record.aspect_ratio,
    imageSize: record.imageSize || record.image_size,
  });
  const rawCount = Number(record.count || record.genCount || 1);
  return {
    ...normalized,
    count: Number.isFinite(rawCount) ? Math.min(Math.max(Math.floor(rawCount), 1), 4) : 1,
  };
}

export function applyDefaultsToPlan(plan: WorkflowPlan, defaults: GenerationDefaults): WorkflowPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      params: {
        model: defaults.model,
        aspectRatio: defaults.aspectRatio,
        imageSize: defaults.imageSize,
        count: defaults.count,
        ...step.params,
      },
    })),
  };
}

export function getIdempotencyKey(headers: Headers, body: Record<string, unknown>) {
  const header = headers.get("idempotency-key") || headers.get("x-idempotency-key");
  if (header?.trim()) return header.trim().slice(0, 160);
  const bodyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
  return bodyKey?.trim() ? bodyKey.trim().slice(0, 160) : null;
}
