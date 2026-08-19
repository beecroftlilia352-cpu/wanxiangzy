import { describe, expect, it, vi } from "vitest";

import {
  dispatchGenerationJob,
  GenerationJobDispatchConfigError,
  resolveGenerationJobDispatchMode,
} from "@/lib/api/generation-job-dispatch";

describe("generation job dispatch policy", () => {
  it("defaults production to durable BullMQ execution", () => {
    expect(resolveGenerationJobDispatchMode({ NODE_ENV: "production" })).toBe("bullmq");
  });

  it("defaults non-production to inline execution for local development", () => {
    expect(resolveGenerationJobDispatchMode({ NODE_ENV: "development" })).toBe("inline");
    expect(resolveGenerationJobDispatchMode({ NODE_ENV: "test" })).toBe("inline");
  });

  it("rejects inline execution in production", () => {
    expect(() => resolveGenerationJobDispatchMode({
      NODE_ENV: "production",
      GENERATION_QUEUE_MODE: "inline",
    })).toThrow(GenerationJobDispatchConfigError);
  });

  it("does not call the executor in BullMQ mode", () => {
    const execute = vi.fn();
    const result = dispatchGenerationJob({
      generationId: "generation-1",
      execute,
      onError: vi.fn(),
      env: { NODE_ENV: "production", GENERATION_QUEUE_MODE: "bullmq" },
    });

    expect(result).toEqual({ mode: "bullmq", startedInline: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it("starts local inline work without awaiting it and reports failures", async () => {
    const failure = new Error("provider failed");
    const execute = vi.fn().mockRejectedValue(failure);
    const onError = vi.fn();
    const result = dispatchGenerationJob({
      generationId: "generation-2",
      execute,
      onError,
      env: { NODE_ENV: "development", GENERATION_QUEUE_MODE: "inline" },
    });

    expect(result).toEqual({ mode: "inline", startedInline: true });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(execute).toHaveBeenCalledWith("generation-2");
  });
});
