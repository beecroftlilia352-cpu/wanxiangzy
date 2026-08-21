import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKER_RUNTIME_CONFIG,
  getWorkerRuntimeAlerts,
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
      imageBatchConcurrency: 8,
      relayConcurrency: 8,
      alertWaiting: 500,
      alertOldestPendingSeconds: 300,
    });
    expect(result.error).toBeNull();
    expect(result.config).toMatchObject({ desiredInstances: 4, workerConcurrency: 16, imageBatchConcurrency: 8, relayConcurrency: 8 });
  });

  it("rejects unsafe or ambiguous values instead of silently clamping Admin writes", () => {
    expect(validateWorkerRuntimeConfig({
      desiredInstances: 0,
      workerConcurrency: 16,
      imageBatchConcurrency: 8,
      relayConcurrency: 8,
      alertWaiting: 100,
      alertOldestPendingSeconds: 300,
    }).error).toContain("desiredInstances");
  });

  it("detects instance and process concurrency drift independently", () => {
    expect(getWorkerRuntimeDrift({
      desired: { ...DEFAULT_WORKER_RUNTIME_CONFIG, desiredInstances: 4, workerConcurrency: 32, imageBatchConcurrency: 8, relayConcurrency: 16 },
      onlineInstances: 2,
      workerConcurrency: 16,
      imageBatchConcurrency: 8,
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
      imageBatchConcurrency: DEFAULT_WORKER_RUNTIME_CONFIG.imageBatchConcurrency,
      relayConcurrency: DEFAULT_WORKER_RUNTIME_CONFIG.relayConcurrency,
    })).toEqual([]);
  });

  it("raises queue alerts at the published thresholds", () => {
    expect(getWorkerRuntimeAlerts({
      desired: { ...DEFAULT_WORKER_RUNTIME_CONFIG, alertWaiting: 100, alertOldestPendingSeconds: 300 },
      waiting: 100,
      oldestPendingSeconds: 301,
    })).toMatchObject({
      breached: true,
      waiting: { current: 100, threshold: 100, breached: true },
      oldestPending: { currentSeconds: 301, thresholdSeconds: 300, breached: true },
      reasons: [
        "BullMQ 等待任务 100，达到告警阈值 100",
        "Outbox 最老待发布任务 301 秒，达到告警阈值 300 秒",
      ],
    });
  });

  it("does not infer a waiting alert when BullMQ health is unavailable", () => {
    expect(getWorkerRuntimeAlerts({
      desired: DEFAULT_WORKER_RUNTIME_CONFIG,
      waiting: null,
      oldestPendingSeconds: 0,
    })).toEqual({
      breached: false,
      reasons: [],
      waiting: { current: null, threshold: 100, breached: false },
      oldestPending: { currentSeconds: 0, thresholdSeconds: 300, breached: false },
    });
  });
});
