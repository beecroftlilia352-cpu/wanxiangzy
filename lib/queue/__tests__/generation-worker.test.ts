import { describe, expect, it, vi } from "vitest";

import type { GenerationQueuePayload } from "@/lib/queue/generation-queue.server";
import {
  createGenerationProcessor,
  createGenerationWorkerRuntime,
  type GenerationQueueEventsLike,
  type GenerationQueueMetricEvent,
  type GenerationWorkerLike,
} from "@/lib/queue/generation-worker.server";

const PAYLOAD: GenerationQueuePayload = {
  schemaVersion: 1,
  generationId: "generation-1",
  deliveryVersion: 3,
  deliveryKey: "generation-generation-1-v3",
  availableAt: "2026-08-18T00:00:00.000Z",
};

function createJob(data: GenerationQueuePayload = PAYLOAD) {
  return { id: data.deliveryKey, name: "generation.execute", data };
}

class FakeRuntimeObject {
  readonly listeners = new Map<string, Array<(...args: never[]) => void>>();
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly run = vi.fn().mockResolvedValue(undefined);
  readonly waitUntilReady = vi.fn().mockResolvedValue(undefined);

  on(event: string, listener: (...args: never[]) => void) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...listenerArgs: unknown[]) => void)(...args);
    }
  }
}

describe("generation BullMQ processor", () => {
  it.each([
    [{ processed: 1, skipped: 0 }, "completed"],
    [{ processed: 1, failed: 1, skipped: 0 }, "business-failed"],
    [{ processed: 0, deferred: 1, skipped: 0 }, "deferred"],
    [{ processed: 0, deferred: 0, skipped: 1 }, "skipped"],
  ] as const)("maps execution summary %o to %s", async (summary, expectedOutcome) => {
    const execute = vi.fn().mockResolvedValue(summary);
    const processor = createGenerationProcessor(execute);

    await expect(processor(createJob())).resolves.toEqual({
      outcome: expectedOutcome,
      generationId: PAYLOAD.generationId,
      deliveryVersion: PAYLOAD.deliveryVersion,
      deliveryKey: PAYLOAD.deliveryKey,
    });
    expect(execute).toHaveBeenCalledWith(PAYLOAD.generationId, PAYLOAD.deliveryVersion);
  });

  it("returns deferred normally instead of triggering Bull failure retry", async () => {
    const processor = createGenerationProcessor(async () => ({ deferred: 1 }));

    await expect(processor(createJob())).resolves.toMatchObject({ outcome: "deferred" });
  });

  it("propagates real execution failures and rejects invalid payloads", async () => {
    const failure = new Error("database unavailable");
    const processor = createGenerationProcessor(vi.fn().mockRejectedValue(failure));

    await expect(processor(createJob())).rejects.toBe(failure);
    await expect(processor(createJob({ ...PAYLOAD, schemaVersion: 2 as 1 }))).rejects.toThrow(/schema/);
  });
});

describe("generation worker runtime", () => {
  it("configures bounded Bull processing and emits QueueEvents metrics", async () => {
    const worker = new FakeRuntimeObject();
    const queueEvents = new FakeRuntimeObject();
    const metrics: GenerationQueueMetricEvent[] = [];
    let capturedProcessor: ((job: ReturnType<typeof createJob>) => Promise<unknown>) | undefined;
    let capturedWorkerOptions: Record<string, unknown> | undefined;

    const runtime = createGenerationWorkerRuntime({
      queueName: "generation-v1",
      concurrency: 4,
      execute: async () => ({ processed: 1 }),
      workerFactory: ((_name, processor, options) => {
        capturedProcessor = processor as typeof capturedProcessor;
        capturedWorkerOptions = options as unknown as Record<string, unknown>;
        return worker as unknown as GenerationWorkerLike;
      }),
      queueEventsFactory: (() => queueEvents as unknown as GenerationQueueEventsLike),
      onMetric: (metric) => metrics.push(metric),
      now: () => new Date("2026-08-18T00:00:00.000Z"),
    });

    expect(capturedWorkerOptions).toMatchObject({
      concurrency: 4,
      autorun: false,
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      maxStalledCount: 2,
      metrics: { maxDataPoints: 1440 },
    });
    await expect(capturedProcessor?.(createJob())).resolves.toMatchObject({ outcome: "completed" });

    queueEvents.emit("completed", {
      jobId: "job-1",
      returnvalue: { outcome: "deferred" },
    });
    queueEvents.emit("stalled", { jobId: "job-2" });
    worker.emit("error", new Error("redis disconnected"));

    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "completed", jobId: "job-1", outcome: "deferred" }),
      expect.objectContaining({ event: "stalled", jobId: "job-2" }),
      expect.objectContaining({ event: "worker.error", reason: "redis disconnected" }),
    ]));
    expect(metrics.every((metric) => metric.queueName === "generation-v1")).toBe(true);
    await runtime.waitUntilReady();
    expect(worker.waitUntilReady).toHaveBeenCalledTimes(1);
    expect(queueEvents.waitUntilReady).toHaveBeenCalledTimes(1);
    expect(worker.run).toHaveBeenCalledTimes(1);
  });

  it("closes the worker before QueueEvents and is idempotent", async () => {
    const closeOrder: string[] = [];
    const worker = new FakeRuntimeObject();
    const queueEvents = new FakeRuntimeObject();
    worker.close.mockImplementation(async () => { closeOrder.push("worker"); });
    queueEvents.close.mockImplementation(async () => { closeOrder.push("events"); });
    const runtime = createGenerationWorkerRuntime({
      queueName: "generation-v1",
      execute: async () => ({ skipped: 1 }),
      workerFactory: (() => worker as unknown as GenerationWorkerLike),
      queueEventsFactory: (() => queueEvents as unknown as GenerationQueueEventsLike),
    });

    await Promise.all([runtime.close(), runtime.close()]);

    expect(closeOrder).toEqual(["worker", "events"]);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(queueEvents.close).toHaveBeenCalledTimes(1);
  });

  it("still closes QueueEvents when worker shutdown fails", async () => {
    const worker = new FakeRuntimeObject();
    const queueEvents = new FakeRuntimeObject();
    worker.close.mockRejectedValue(new Error("worker close failed"));
    const runtime = createGenerationWorkerRuntime({
      queueName: "generation-v1",
      execute: async () => ({ skipped: 1 }),
      workerFactory: (() => worker as unknown as GenerationWorkerLike),
      queueEventsFactory: (() => queueEvents as unknown as GenerationQueueEventsLike),
    });

    await expect(runtime.close()).rejects.toThrow("worker close failed");
    expect(queueEvents.close).toHaveBeenCalledTimes(1);
  });
});
