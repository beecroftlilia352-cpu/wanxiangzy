/**
 * API-side dispatch policy for generation jobs.
 *
 * `createDebitedGeneration` writes the generation and its transactional
 * outbox delivery in one database transaction. Production therefore only
 * acknowledges that commit; the relay and BullMQ Worker execute it later.
 * Inline execution exists solely for local/test environments.
 */

export type GenerationJobDispatchMode = "bullmq" | "inline";

export type GenerationJobDispatchResult = {
  mode: GenerationJobDispatchMode;
  startedInline: boolean;
};

type DispatchEnvironment = {
  NODE_ENV?: string;
  GENERATION_QUEUE_MODE?: string;
};

export class GenerationJobDispatchConfigError extends Error {
  constructor(message: string) {
    super(`[generation-job-dispatch] ${message}`);
    this.name = "GenerationJobDispatchConfigError";
  }
}

/**
 * Production is deliberately BullMQ-only. This is fail-closed: an accidental
 * inline override is rejected instead of tying expensive provider work to an
 * API process that may be restarted as soon as the response has been sent.
 */
export function resolveGenerationJobDispatchMode(
  env: DispatchEnvironment = process.env,
): GenerationJobDispatchMode {
  const configured = env.GENERATION_QUEUE_MODE?.trim().toLowerCase();
  const mode = configured || (env.NODE_ENV === "production" ? "bullmq" : "inline");

  if (mode !== "bullmq" && mode !== "inline") {
    throw new GenerationJobDispatchConfigError(
      `GENERATION_QUEUE_MODE must be "bullmq" or "inline"; got ${JSON.stringify(configured)}`,
    );
  }
  if (env.NODE_ENV === "production" && mode !== "bullmq") {
    throw new GenerationJobDispatchConfigError(
      "production requires GENERATION_QUEUE_MODE=bullmq",
    );
  }

  return mode;
}

/**
 * Start the local first-chance executor only when policy permits it. The
 * returned value is immediate in both modes; callers must not await provider
 * execution from an API request. `onError` observes inline failures while the
 * durable queue row remains available for worker retry/recovery.
 */
export function dispatchGenerationJob(params: {
  generationId: string;
  execute: (generationId: string) => Promise<unknown>;
  onError: (error: unknown) => void;
  env?: DispatchEnvironment;
}): GenerationJobDispatchResult {
  const mode = resolveGenerationJobDispatchMode(params.env);
  if (mode === "bullmq") {
    return { mode, startedInline: false };
  }

  void Promise.resolve()
    .then(() => params.execute(params.generationId))
    .catch(params.onError);
  return { mode, startedInline: true };
}
