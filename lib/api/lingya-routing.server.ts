import { executeAiRouted } from "@/lib/ai-control-plane/router.server";
import { generateImage, type GenerateInput, type GenerateResult } from "@/lib/api/lingya";

/** Server-only image execution entrypoint. Keep the catalog/core module browser-safe. */
export async function generateImageWithControlPlane(input: GenerateInput, retries = 2): Promise<GenerateResult> {
  return executeAiRouted({
    modelId: input.model,
    modality: "image",
    context: { requiredCapabilities: [input.image?.length ? "edit" : "generation"] },
    execute: (deployment) => generateImage({ ...input, routingDeployment: deployment }, retries),
    describeResult: (result) => ({
      outputUnits: result.url || result.b64_json ? 1 : 0,
      metadata: { taskId: result.taskId || "sync" },
    }),
  });
}
