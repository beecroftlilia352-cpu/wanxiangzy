import { createHash } from "node:crypto";
import { executeAiRouted } from "@/lib/ai-control-plane/router.server";
import { getAiRouteContext } from "@/lib/ai-control-plane/context.server";
import { generateImage, type GenerateInput, type GenerateResult } from "@/lib/api/lingya";

/** Server-only image execution entrypoint. Keep the catalog/core module browser-safe. */
export async function generateImageWithControlPlane(input: GenerateInput, retries = 1): Promise<GenerateResult> {
  let upstreamSubmitted = false;
  const routeContext = getAiRouteContext();
  // A provider POST is not safely replayable when the response is lost. The
  // router owns bounded cross-deployment failover; keep each adapter to one
  // submission and rely on Idempotency-Key for provider-side dedupe.
  const providerAttempts = Math.min(Math.max(Math.floor(retries), 1), 1);
  const idempotencyKey = input.idempotencyKey || (routeContext.generationId
    ? `gen-image:${routeContext.generationId}:slot-${Number.isInteger(routeContext.slotIndex) ? routeContext.slotIndex : 0}:${createHash("sha256").update(JSON.stringify({ model: input.model, prompt: input.prompt, image: input.image || [], slotIndex: routeContext.slotIndex ?? 0 })).digest("hex").slice(0, 32)}`
    : undefined);
  return executeAiRouted({
    modelId: input.model,
    modality: "image",
    context: { requiredCapabilities: [input.image?.length ? "edit" : "generation"] },
    canFailover: () => !upstreamSubmitted,
    execute: (deployment) => {
      // Once the adapter POST starts, a lost response is indistinguishable from
      // an accepted upstream job. Never fail over blindly; the stable key lets
      // a provider deduplicate a retry/reconciliation instead.
      upstreamSubmitted = true;
      return generateImage({
        ...input,
        idempotencyKey,
        routingDeployment: deployment,
        onProgress: async (progress) => {
          await input.onProgress?.(progress);
        },
      }, providerAttempts);
    },
    describeResult: (result) => ({
      outputUnits: result.url || result.b64_json ? 1 : 0,
      metadata: { taskId: result.taskId || "sync" },
    }),
  });
}
