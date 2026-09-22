import { createHash } from "node:crypto";
import { executeAiRouted } from "@/lib/ai-control-plane/router.server";
import { getAiRouteContext } from "@/lib/ai-control-plane/context.server";
import { generateImage, type GenerateInput, type GenerateResult } from "@/lib/api/lingya";
import { createKieReferenceImageResolver } from "@/lib/api/kie-reference-image.server";
import { isProviderHttpResponseError } from "@/lib/api/generation-errors";

/** Server-only image execution entrypoint. Keep the catalog/core module browser-safe. */
export async function generateImageWithControlPlane(input: GenerateInput, retries = 1): Promise<GenerateResult> {
  const routeContext = getAiRouteContext();
  // kie 只接受公网可访问的参考图：内网/站内参考图先转存到 kie 文件服务。解析器按调用创建，
  // 同一次生成（含跨部署重试）内同一张参考图只上传一次。
  const resolveKieImageUrls = createKieReferenceImageResolver();
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
    // Fail over only after a structured HTTP rejection that proves the first
    // provider did not accept the job. Timeouts, disconnects, 5xx responses
    // and malformed 2xx bodies remain ambiguous and must not be replayed.
    canFailover: (error) => isProviderHttpResponseError(error) && error.safeToFailover,
    execute: (deployment) => {
      return generateImage({
        ...input,
        idempotencyKey,
        routingDeployment: deployment,
        resolveKieImageUrls,
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
