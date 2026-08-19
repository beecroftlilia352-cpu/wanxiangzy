import { buildAiAdapterAuthHeaders, mergeAiAdapterParameters, resolveAiAdapterUrl } from "@/lib/ai-control-plane/adapters";
import { executeAiRouted } from "@/lib/ai-control-plane/router.server";
import type { AiRouteContext, AiResolvedDeployment } from "@/lib/ai-control-plane/types";

export type LlmChatKind = "text" | "vision";

export type LlmChatCompletion = {
  data: Record<string, unknown>;
  providerId: string;
  deploymentId: string;
  upstreamModel: string;
};

export class LlmChatProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LlmChatProviderError";
    this.status = status;
  }
}

/**
 * Server-only OpenAI-chat execution through the model control plane. A caller
 * supplies the standard chat payload; the selected deployment owns endpoint,
 * auth, model, capacity lease, retry, circuit breaker and fallback behavior.
 */
export async function executeLlmChatRouted(input: {
  kind: LlmChatKind;
  body: Record<string, unknown>;
  context?: AiRouteContext;
  /** Invalid structured output is a provider failure and may use another deployment. */
  validate?: (data: Record<string, unknown>) => void;
}): Promise<LlmChatCompletion> {
  return executeAiRouted({
    modelId: `${input.kind}-default`,
    modality: input.kind,
    context: input.context,
    execute: (deployment) => executeOpenAiChatDeployment(deployment, input.body, input.validate),
    describeResult: (result) => {
      const usage = record(result.data.usage);
      return {
        inputUnits: finite(usage.prompt_tokens ?? usage.input_tokens),
        outputUnits: finite(usage.completion_tokens ?? usage.output_tokens),
        metadata: { responseModel: text(result.data.model) || result.upstreamModel },
      };
    },
  });
}

async function executeOpenAiChatDeployment(
  deployment: AiResolvedDeployment,
  body: Record<string, unknown>,
  validate?: (data: Record<string, unknown>) => void,
): Promise<LlmChatCompletion> {
  if (deployment.protocol !== "openai-chat") {
    throw new Error(`文本部署 ${deployment.id} 的协议不是 openai-chat`);
  }
  const response = await fetch(resolveAiAdapterUrl({
    baseUrl: deployment.provider.baseUrl,
    protocol: deployment.protocol,
    operation: "generation",
    adapterConfig: deployment.adapterConfig,
    model: deployment.upstreamModel,
  }), {
    method: "POST",
    headers: {
      ...buildAiAdapterAuthHeaders({ protocol: deployment.protocol, apiKey: deployment.apiKey, adapterConfig: deployment.adapterConfig }),
      "Content-Type": "application/json",
    },
    signal: deployment.abortSignal,
    body: JSON.stringify(mergeAiAdapterParameters({ ...body, model: deployment.upstreamModel }, deployment.adapterConfig)),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new LlmChatProviderError(response.status, `LLM provider HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new LlmChatProviderError(response.status, "LLM provider returned invalid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new LlmChatProviderError(response.status, "LLM provider returned an invalid response body");
  }
  const parsed = data as Record<string, unknown>;
  validate?.(parsed);
  return {
    data: parsed,
    providerId: deployment.providerId,
    deploymentId: deployment.id,
    upstreamModel: deployment.upstreamModel,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finite(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
