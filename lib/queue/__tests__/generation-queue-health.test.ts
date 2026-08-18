import { describe, expect, it, vi } from "vitest";

import { parseBullMqConfig } from "@/lib/queue/bullmq-config.server";
import { getGenerationBullMqHealth } from "@/lib/queue/generation-queue-health.server";

const CONFIG = parseBullMqConfig({
  NODE_ENV: "test",
  GENERATION_QUEUE_MODE: "bullmq",
  REDIS_URL: "redis://:test-password@127.0.0.1:6379/0",
});

describe("generation BullMQ health", () => {
  it("reports queue counts, worker presence and latency without exposing connection details", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const health = await getGenerationBullMqHealth({
      config: CONFIG,
      now: (() => {
        const values = [1_000, 1_025];
        return () => values.shift() ?? 1_025;
      })(),
      queueFactory: () => ({
        getJobCounts: vi.fn().mockResolvedValue({
          waiting: 7,
          active: 3,
          delayed: 2,
          prioritized: 1,
          completed: 100,
          failed: 4,
          "waiting-children": 5,
        }),
        getWorkersCount: vi.fn().mockResolvedValue(2),
        isPaused: vi.fn().mockResolvedValue(false),
        close,
      }),
    });

    expect(health).toEqual({
      configured: true,
      reachable: true,
      queueName: "generation-jobs",
      latencyMs: 25,
      workers: 2,
      paused: false,
      counts: {
        waiting: 7,
        active: 3,
        delayed: 2,
        prioritized: 1,
        completed: 100,
        failed: 4,
        waitingChildren: 5,
      },
      error: null,
    });
    expect(JSON.stringify(health)).not.toContain("test-password");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fails closed and still closes the observer client", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const health = await getGenerationBullMqHealth({
      config: CONFIG,
      queueFactory: () => ({
        getJobCounts: vi.fn().mockRejectedValue(new Error("redis unavailable")),
        getWorkersCount: vi.fn().mockResolvedValue(0),
        isPaused: vi.fn().mockResolvedValue(false),
        close,
      }),
    });

    expect(health).toMatchObject({ configured: true, reachable: false, error: "redis unavailable" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not create a Redis client while BullMQ is disabled", async () => {
    const factory = vi.fn();
    const health = await getGenerationBullMqHealth({
      config: parseBullMqConfig({ NODE_ENV: "test", GENERATION_QUEUE_MODE: "inline" }),
      queueFactory: factory,
    });

    expect(health).toMatchObject({ configured: false, reachable: false });
    expect(factory).not.toHaveBeenCalled();
  });
});
