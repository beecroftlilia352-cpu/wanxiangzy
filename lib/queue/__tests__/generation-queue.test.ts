import { describe, expect, it, vi } from "vitest";

import {
  createGenerationDeliveryJobId,
  createGenerationQueueRuntime,
  type GenerationQueueLike,
} from "@/lib/queue/generation-queue.server";

function createFakeQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: "queued" }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as GenerationQueueLike & {
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

describe("generation queue runtime", () => {
  it("enqueues only the minimal delivery payload with a deterministic id", async () => {
    const queue = createFakeQueue();
    const runtime = createGenerationQueueRuntime({
      queueName: "generation-v1",
      queue,
      now: () => Date.parse("2026-08-18T00:00:00.000Z"),
    });
    const input = {
      generationId: "7b3f8058-3ea2-47ad-8a4c-5f86a3bdcd8a",
      deliveryVersion: 1,
      deliveryKey: "generation-7b3f8058-3ea2-47ad-8a4c-5f86a3bdcd8a-v1",
      availableAt: "2026-08-18T00:01:00.000Z",
      serviceTier: "vip" as const,
      queuePriority: 2 as const,
    };

    const first = await runtime.enqueue(input);
    const second = await runtime.enqueue(input);

    expect(first.jobId).toBe(second.jobId);
    expect(first.jobId).toBe(input.deliveryKey);
    expect(first.jobId).not.toContain(":");
    expect(first.delayMs).toBe(60_000);
    expect(Object.keys(first.payload).sort()).toEqual([
      "availableAt",
      "deliveryKey",
      "deliveryVersion",
      "generationId",
      "queuePriority",
      "schemaVersion",
      "serviceTier",
    ]);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      "generation.execute",
      first.payload,
      expect.objectContaining({
        jobId: first.jobId,
        delay: 60_000,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000, jitter: 0.5 },
        priority: 2,
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      "generation.execute",
      first.payload,
      expect.objectContaining({ jobId: first.jobId }),
    );
  });

  it("uses a new job id for the next delivery of the same generation", () => {
    const first = createGenerationDeliveryJobId("generation-1", 1, "generation-generation-1-v1");
    const second = createGenerationDeliveryJobId("generation-1", 2, "generation-generation-1-v2");

    expect(first).not.toBe(second);
    expect(first).not.toContain(":");
    expect(second).not.toContain(":");
  });

  it("removes an exhausted infrastructure delivery before deterministic redrive", async () => {
    const queue = createFakeQueue();
    const remove = vi.fn().mockResolvedValue(undefined);
    queue.getJob = vi.fn().mockResolvedValue({
      getState: vi.fn().mockResolvedValue("failed"),
      remove,
    });
    const runtime = createGenerationQueueRuntime({ queueName: "generation-v1", queue });

    await runtime.enqueue({
      generationId: "generation-1",
      deliveryVersion: 1,
      deliveryKey: "generation-generation-1-v1",
      availableAt: new Date(),
      serviceTier: "standard",
      queuePriority: 20,
    });

    expect(remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it("rejects delivery keys that BullMQ cannot use as custom ids", () => {
    expect(() => createGenerationDeliveryJobId("generation-1", 1, "bad:key")).toThrow(/portable/);
    expect(() => createGenerationDeliveryJobId("generation-1", 1, "1234")).toThrow(/portable/);
  });

  it("normalizes past availability to zero delay and rejects malformed input", async () => {
    const queue = createFakeQueue();
    const runtime = createGenerationQueueRuntime({
      queueName: "generation-v1",
      queue,
      now: () => Date.parse("2026-08-18T00:02:00.000Z"),
    });

    const result = await runtime.enqueue({
      generationId: "generation-1",
      deliveryVersion: 1,
      deliveryKey: "generation-generation-1-v1",
      availableAt: "2026-08-18T00:01:00.000Z",
      serviceTier: "standard",
      queuePriority: 20,
    });
    expect(result.delayMs).toBe(0);
    await expect(runtime.enqueue({
      generationId: "generation-1",
      deliveryVersion: 2,
      deliveryKey: "generation-generation-1-v2",
      availableAt: "not-a-date",
      serviceTier: "standard",
      queuePriority: 20,
    })).rejects.toThrow(/availableAt/);
  });

  it("closes the queue at most once", async () => {
    const queue = createFakeQueue();
    const runtime = createGenerationQueueRuntime({ queueName: "generation-v1", queue });

    await Promise.all([runtime.close(), runtime.close()]);

    expect(queue.close).toHaveBeenCalledTimes(1);
  });
});
