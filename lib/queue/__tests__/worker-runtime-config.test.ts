import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKER_RUNTIME_CONFIG,
  parseWorkerRuntimeConfig,
  validateWorkerRuntimeConfig,
} from "@/lib/queue/worker-runtime-config";

describe("Worker runtime control config", () => {
  it("uses a conservative default when no Admin version exists", () => {
    expect(parseWorkerRuntimeConfig(null)).toEqual(DEFAULT_WORKER_RUNTIME_CONFIG);
  });

  it("accepts a bounded multi-worker capacity profile", () => {
    const result = validateWorkerRuntimeConfig({
      desiredInstances: 4,
      workerConcurrency: 16,
      relayConcurrency: 8,
      alertWaiting: 500,
      alertOldestPendingSeconds: 300,
    });
    expect(result.error).toBeNull();
    expect(result.config).toMatchObject({ desiredInstances: 4, workerConcurrency: 16, relayConcurrency: 8 });
  });

  it("rejects unsafe or ambiguous values instead of silently clamping Admin writes", () => {
    expect(validateWorkerRuntimeConfig({
      desiredInstances: 0,
      workerConcurrency: 16,
      relayConcurrency: 8,
      alertWaiting: 100,
      alertOldestPendingSeconds: 300,
    }).error).toContain("desiredInstances");
  });
});
