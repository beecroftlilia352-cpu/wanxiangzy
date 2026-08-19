import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  TASK_QUEUE_CACHE_MODE: process.env.TASK_QUEUE_CACHE_MODE,
  REDIS_URL: process.env.REDIS_URL,
};

describe("task queue redis cache", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("initializes redis by default when credentials are configured", async () => {
    process.env.TASK_QUEUE_CACHE_MODE = "";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
    vi.resetModules();

    const { getTaskQueueRedis } = await import("../redis/task-queue-cache");

    expect(getTaskQueueRedis()).not.toBeNull();
  });

  it("does not initialize redis when task queue cache mode is supabase", async () => {
    process.env.TASK_QUEUE_CACHE_MODE = "supabase";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
    vi.resetModules();

    const { getTaskQueueRedis } = await import("../redis/task-queue-cache");

    expect(getTaskQueueRedis()).toBeNull();
  });
});

function restoreEnv() {
  setEnvValue("TASK_QUEUE_CACHE_MODE", ORIGINAL_ENV.TASK_QUEUE_CACHE_MODE);
  setEnvValue("REDIS_URL", ORIGINAL_ENV.REDIS_URL);
}

function setEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
