import { describe, expect, it, vi } from "vitest";

import {
  runGenerationPriorityAgingBatch,
  STANDARD_PRIORITY_AGING_MS,
} from "@/lib/queue/generation-priority-aging.server";
import type { GenerationQueueLike, GenerationQueuePayload } from "@/lib/queue/generation-queue.server";

function payload(serviceTier: "standard" | "vip"): GenerationQueuePayload {
  return {
    schemaVersion: 1,
    generationId: crypto.randomUUID(),
    deliveryVersion: 1,
    deliveryKey: `generation-${crypto.randomUUID()}-v1`,
    availableAt: "2026-08-22T00:00:00.000Z",
    serviceTier,
    queuePriority: serviceTier === "vip" ? 2 : 20,
  };
}

describe("generation priority aging", () => {
  it("promotes only standard jobs that have waited at least two minutes", async () => {
    const now = Date.parse("2026-08-22T00:10:00.000Z");
    const aged = { data: payload("standard"), timestamp: now - STANDARD_PRIORITY_AGING_MS, opts: { priority: 20 }, changePriority: vi.fn() };
    const fresh = { data: payload("standard"), timestamp: now - STANDARD_PRIORITY_AGING_MS + 1, opts: { priority: 20 }, changePriority: vi.fn() };
    const vip = { data: payload("vip"), timestamp: now - 10 * 60_000, opts: { priority: 2 }, changePriority: vi.fn() };
    const queue = {
      getCountsPerPriority: vi.fn().mockResolvedValue({ 2: 7, 5: 1_000 }),
      getPrioritized: vi.fn().mockResolvedValue([aged, fresh, vip]),
    } as unknown as GenerationQueueLike;

    await expect(runGenerationPriorityAgingBatch({ queue, now: () => now })).resolves.toEqual({ scanned: 3, promoted: 1 });
    expect(aged.changePriority).toHaveBeenCalledWith({ priority: 5 });
    expect(fresh.changePriority).not.toHaveBeenCalled();
    expect(vip.changePriority).not.toHaveBeenCalled();
    expect(queue.getPrioritized).toHaveBeenCalledWith(1_007, 1_506);
  });
});
