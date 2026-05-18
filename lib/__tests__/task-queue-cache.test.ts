import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  TASK_QUEUE_CACHE_MODE: process.env.TASK_QUEUE_CACHE_MODE,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

describe("task queue redis cache", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("initializes redis by default when credentials are configured", async () => {
    process.env.TASK_QUEUE_CACHE_MODE = "";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    vi.resetModules();

    const { getTaskQueueRedis } = await import("../redis/task-queue-cache");

    expect(getTaskQueueRedis()).not.toBeNull();
  });

  it("does not initialize redis when task queue cache mode is supabase", async () => {
    process.env.TASK_QUEUE_CACHE_MODE = "supabase";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    vi.resetModules();

    const { getTaskQueueRedis } = await import("../redis/task-queue-cache");

    expect(getTaskQueueRedis()).toBeNull();
  });
});

function restoreEnv() {
  setEnvValue("TASK_QUEUE_CACHE_MODE", ORIGINAL_ENV.TASK_QUEUE_CACHE_MODE);
  setEnvValue("UPSTASH_REDIS_REST_URL", ORIGINAL_ENV.UPSTASH_REDIS_REST_URL);
  setEnvValue("UPSTASH_REDIS_REST_TOKEN", ORIGINAL_ENV.UPSTASH_REDIS_REST_TOKEN);
}

function setEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
