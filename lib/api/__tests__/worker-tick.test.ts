import { describe, expect, it, vi } from "vitest";

import {
  createWorkerSupervisorControl,
  loadDotEnvIfPresent,
  shutdownInOrder,
  validateWorkerRuntimeEnv,
} from "@/scripts/worker";

describe("clean-slate worker supervisor", () => {
  it("turns the first signal or fatal loop into one shared stop fence", async () => {
    const control = createWorkerSupervisorControl();
    control.requestStop("SIGTERM");
    control.requestStop("media.validation.fatal", new Error("late"));

    await expect(control.waitForStop()).resolves.toEqual({ reason: "SIGTERM", error: undefined });
    expect(control.isStopping()).toBe(true);
  });

  it("drains BullMQ and durable loops before closing the producer", async () => {
    const order: string[] = [];
    await shutdownInOrder({
      workerClose: vi.fn(async () => { order.push("worker"); }),
      loops: [
        Promise.resolve().then(() => { order.push("relay"); }),
        Promise.resolve().then(() => { order.push("media"); }),
      ],
      producerClose: vi.fn(async () => { order.push("producer"); }),
    });

    expect(order[0]).toBe("worker");
    expect(order.at(-1)).toBe("producer");
    expect(order).toEqual(expect.arrayContaining(["relay", "media"]));
  });

  it("still closes the producer if BullMQ drain fails", async () => {
    const producerClose = vi.fn(async () => undefined);
    await expect(shutdownInOrder({
      workerClose: async () => { throw new Error("drain failed"); },
      loops: [],
      producerClose,
    })).rejects.toThrow("drain failed");
    expect(producerClose).toHaveBeenCalledOnce();
  });

  it("loads dotenv files without overwriting process env", () => {
    process.env.LOAD_DOTENV_TEST = "preserved";
    try {
      loadDotEnvIfPresent();
      expect(process.env.LOAD_DOTENV_TEST).toBe("preserved");
    } finally {
      delete process.env.LOAD_DOTENV_TEST;
    }
  });

  it("refuses to run the durable supervisor outside production", () => {
    const base = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      REDIS_URL: "redis://127.0.0.1:6379",
    } as unknown as NodeJS.ProcessEnv;
    expect(() => validateWorkerRuntimeEnv({ ...base, NODE_ENV: "test" })).toThrow("NODE_ENV=production");
    expect(() => validateWorkerRuntimeEnv({ ...base, NODE_ENV: "production" })).not.toThrow();
  });
});
