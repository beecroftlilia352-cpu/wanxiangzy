import { describe, expect, it, vi } from "vitest";

import {
  computeOutboxRetryDelaySeconds,
  runGenerationOutboxRelay,
  runGenerationOutboxRelayBatch,
  type GenerationOutboxDatabase,
} from "@/lib/queue/generation-outbox-relay.server";

const ROW = {
  outbox_id: "10000000-0000-4000-8000-000000000001",
  generation_id: "20000000-0000-4000-8000-000000000002",
  delivery_version: 1,
  delivery_key: "generation-20000000-0000-4000-8000-000000000002-v1",
  available_at: "2026-08-18T00:00:00.000Z",
  lease_token: "30000000-0000-4000-8000-000000000003",
  attempts: 1,
  service_tier: "vip" as const,
  queue_priority: 2 as const,
};

function database(responses: Array<{ data: unknown; error: { message: string } | null }>) {
  return { rpc: vi.fn(async () => responses.shift()!) } as GenerationOutboxDatabase & {
    rpc: ReturnType<typeof vi.fn>;
  };
}

describe("generation outbox relay", () => {
  it("publishes and confirms the exact delivery fence", async () => {
    const db = database([{ data: [ROW], error: null }, { data: true, error: null }]);
    const enqueue = vi.fn(async () => ({ jobId: ROW.delivery_key, delayMs: 0, payload: {} as never }));

    await expect(runGenerationOutboxRelayBatch({
      database: db,
      publisher: { enqueue },
      batchSize: 100,
      concurrency: 8,
      claimTtlMs: 60_000,
    })).resolves.toEqual({ claimed: 1, published: 1, retried: 0, leaseLost: 0, failed: 0 });

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      generationId: ROW.generation_id,
      deliveryVersion: 1,
      deliveryKey: ROW.delivery_key,
      serviceTier: "vip",
      queuePriority: 2,
    }));
    expect(db.rpc).toHaveBeenNthCalledWith(2, "confirm_generation_outbox", {
      p_outbox_id: ROW.outbox_id,
      p_lease_token: ROW.lease_token,
      p_bullmq_job_id: ROW.delivery_key,
    });
  });

  it("passes the bounded execution recovery budget", async () => {
    const db = database([
      { data: [], error: null },
      { data: { recovered_leases: 0 }, error: null },
      { data: 0, error: null },
    ]);
    let stopping = false;
    await runGenerationOutboxRelay({
      database: db,
      publisher: { enqueue: vi.fn() },
      config: {
        batchSize: 10,
        concurrency: 2,
        pollIntervalMs: 500,
        maxPollIntervalMs: 60_000,
        recoveryIntervalMs: 0,
        claimTtlMs: 60_000,
      },
      control: { isStopping: () => stopping },
      sleep: async () => { stopping = true; },
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "recover_generation_outbox", {
      p_limit: 500,
      p_max_execution_attempts: 2,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(3, "recover_stale_generation_capacity_waits", { p_limit: 100 });
  });

  it("nacks publish failures with bounded deterministic backoff", async () => {
    const db = database([{ data: [{ ...ROW, attempts: 4 }], error: null }, { data: true, error: null }]);
    const enqueue = vi.fn().mockRejectedValue(new Error("redis offline"));

    await expect(runGenerationOutboxRelayBatch({
      database: db,
      publisher: { enqueue },
      batchSize: 10,
      concurrency: 2,
      claimTtlMs: 60_000,
    })).resolves.toMatchObject({ claimed: 1, retried: 1, published: 0 });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "nack_generation_outbox", expect.objectContaining({
      p_outbox_id: ROW.outbox_id,
      p_error: "redis offline",
      p_delay_seconds: computeOutboxRetryDelaySeconds(4, ROW.outbox_id),
    }));
  });

  it("does not nack another publisher after the lease is lost", async () => {
    const db = database([{ data: [ROW], error: null }, { data: false, error: null }]);
    const enqueue = vi.fn(async () => ({ jobId: ROW.delivery_key, delayMs: 0, payload: {} as never }));

    await expect(runGenerationOutboxRelayBatch({
      database: db,
      publisher: { enqueue },
      batchSize: 10,
      concurrency: 2,
      claimTtlMs: 60_000,
    })).resolves.toMatchObject({ leaseLost: 1, retried: 0 });
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed claim rows before publishing", async () => {
    const db = database([{ data: [{ ...ROW, delivery_version: 0 }], error: null }]);
    await expect(runGenerationOutboxRelayBatch({
      database: db,
      publisher: { enqueue: vi.fn() },
      batchSize: 10,
      concurrency: 2,
      claimTtlMs: 60_000,
    })).rejects.toThrow(/malformed/);
  });

  it("bounds connected wake waits by the polling fallback", async () => {
    const db = database([
      { data: [], error: null },
      { data: { recovered_leases: 0 }, error: null },
    ]);
    let stopping = false;
    const wait = vi.fn(async () => {
      stopping = true;
      return false;
    });

    await runGenerationOutboxRelay({
      database: db,
      publisher: { enqueue: vi.fn() },
      config: {
        batchSize: 10,
        concurrency: 2,
        pollIntervalMs: 500,
        maxPollIntervalMs: 60_000,
        recoveryIntervalMs: 300_000,
        claimTtlMs: 60_000,
      },
      control: { isStopping: () => stopping },
      wake: { isConnected: () => true, wait },
    });

    expect(wait).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(60_000, expect.any(Function));
  });
});
