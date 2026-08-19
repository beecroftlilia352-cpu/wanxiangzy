import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKER_RUNTIME_CONFIG,
  getWorkerRuntimeDrift,
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

  it("detects instance and process concurrency drift independently", () => {
    expect(getWorkerRuntimeDrift({
      desired: { ...DEFAULT_WORKER_RUNTIME_CONFIG, desiredInstances: 4, workerConcurrency: 32, relayConcurrency: 16 },
      onlineInstances: 2,
      workerConcurrency: 16,
      relayConcurrency: 8,
    })).toEqual([
      "实例数期望 4，在线 2",
      "Worker 并发期望 32，当前 16",
      "Relay 并发期望 16，当前 8",
    ]);
    expect(getWorkerRuntimeDrift({
      desired: { ...DEFAULT_WORKER_RUNTIME_CONFIG, desiredInstances: 4 },
      onlineInstances: null,
      workerConcurrency: DEFAULT_WORKER_RUNTIME_CONFIG.workerConcurrency,
      relayConcurrency: DEFAULT_WORKER_RUNTIME_CONFIG.relayConcurrency,
    })).toEqual([]);
  });
});
