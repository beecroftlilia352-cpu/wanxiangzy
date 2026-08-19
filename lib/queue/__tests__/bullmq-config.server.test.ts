import { describe, expect, it } from "vitest";

import {
  BULLMQ_CONFIG_DEFAULTS,
  BullMqConfigError,
  parseBullMqConfig,
} from "@/lib/queue/bullmq-config.server";

describe("BullMQ production configuration", () => {
  it("defaults development and test to inline execution without requiring Redis", () => {
    expect(parseBullMqConfig({ NODE_ENV: "development" })).toMatchObject({
      mode: "inline",
      enabled: false,
      prefix: "{wanxiangzy:generation}",
      queueName: "generation-jobs",
      connections: null,
    });
    expect(parseBullMqConfig({ NODE_ENV: "test" }).mode).toBe("inline");
  });

  it("defaults and forces production to BullMQ, failing closed without REDIS_URL", () => {
    expect(() => parseBullMqConfig({ NODE_ENV: "production" }))
      .toThrowError(expect.objectContaining({ name: "BullMqConfigError", field: "REDIS_URL" }));
    expect(() => parseBullMqConfig({ NODE_ENV: "production", GENERATION_QUEUE_MODE: "inline", REDIS_URL: "redis://localhost" }))
      .toThrowError(expect.objectContaining({ field: "GENERATION_QUEUE_MODE" }));
    expect(parseBullMqConfig({ NODE_ENV: "production", REDIS_URL: "rediss://redis.example.com" }))
      .toMatchObject({ mode: "bullmq", enabled: true });
  });

  it("accepts clean-slate modes and rejects removed migration modes", () => {
    const redis = { REDIS_URL: "redis://localhost:6379/0" };
    expect(parseBullMqConfig({ GENERATION_QUEUE_MODE: "inline" }).mode).toBe("inline");
    expect(parseBullMqConfig({ ...redis, GENERATION_QUEUE_MODE: "bullmq" }).mode).toBe("bullmq");
    expect(() => parseBullMqConfig({ ...redis, GENERATION_QUEUE_MODE: "postgres" })).toThrow(BullMqConfigError);
    expect(() => parseBullMqConfig({ ...redis, GENERATION_QUEUE_MODE: "dual" })).toThrow(BullMqConfigError);
    expect(() => parseBullMqConfig({ ...redis, GENERATION_QUEUE_MODE: "bullmq-primary" })).toThrow(BullMqConfigError);
  });

  it("parses redis and rediss URLs into safe ioredis options", () => {
    const plain = parseBullMqConfig({
      GENERATION_QUEUE_MODE: "bullmq",
      REDIS_URL: "redis://queue-user:p%40ss@127.0.0.1:6381/2",
    });
    expect(plain.connections?.producer).toMatchObject({
      host: "127.0.0.1",
      port: 6381,
      username: "queue-user",
      password: "p@ss",
      db: 2,
    });
    expect(plain.connections?.producer).not.toHaveProperty("tls");

    const tls = parseBullMqConfig({
      GENERATION_QUEUE_MODE: "bullmq",
      REDIS_URL: "rediss://cache.example.com",
    });
    expect(tls.connections?.worker).toMatchObject({ host: "cache.example.com", port: 6379, db: 0, tls: {} });
  });

  it.each([
    "http://localhost:6379",
    "redis://localhost/not-a-db",
    "redis://localhost/16",
    "redis://localhost/0?keyPrefix=unsafe",
    "redis://localhost/0?family=4",
    "redis://localhost/0#fragment",
  ])("rejects unsafe Redis URL %s", (url) => {
    expect(() => parseBullMqConfig({ GENERATION_QUEUE_MODE: "bullmq", REDIS_URL: url }))
      .toThrowError(expect.objectContaining({ field: "REDIS_URL" }));
  });

  it("creates separate fail-fast producer and persistent worker/observer options", () => {
    const config = parseBullMqConfig({
      GENERATION_QUEUE_MODE: "bullmq",
      REDIS_URL: "redis://localhost:6379",
    });
    const connections = config.connections!;
    expect(connections.producer).not.toBe(connections.worker);
    expect(connections.worker).not.toBe(connections.observer);
    expect(connections.producer).toMatchObject({ enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    expect(connections.producer.retryStrategy(3)).toBeNull();
    expect(connections.worker).toMatchObject({ enableOfflineQueue: true, maxRetriesPerRequest: null });
    expect(connections.observer).toMatchObject({ enableOfflineQueue: true, maxRetriesPerRequest: null });
    expect(connections.worker.retryStrategy(100)).toBe(20_000);
    expect(connections.observer.retryStrategy(100)).toBe(20_000);
    for (const connection of Object.values(connections)) expect(connection).not.toHaveProperty("keyPrefix");
  });

  it("enforces a Redis Cluster hash-tag prefix and a portable queue name", () => {
    const base = { GENERATION_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost" };
    expect(parseBullMqConfig({ ...base, BULLMQ_PREFIX: "{tenant-a:generation}", BULLMQ_QUEUE_NAME: "generation_jobs-v2" }))
      .toMatchObject({ prefix: "{tenant-a:generation}", queueName: "generation_jobs-v2" });
    expect(() => parseBullMqConfig({ ...base, BULLMQ_PREFIX: "bull" }))
      .toThrowError(expect.objectContaining({ field: "BULLMQ_PREFIX" }));
    expect(() => parseBullMqConfig({ ...base, BULLMQ_QUEUE_NAME: "generation:jobs" }))
      .toThrowError(expect.objectContaining({ field: "BULLMQ_QUEUE_NAME" }));
  });

  it.each([
    ["BULLMQ_WORKER_CONCURRENCY", "0"],
    ["BULLMQ_WORKER_CONCURRENCY", "513"],
    ["BULLMQ_LOCK_DURATION_MS", "9999"],
    ["BULLMQ_COMPLETED_RETENTION_COUNT", "99"],
    ["BULLMQ_FAILED_RETENTION_AGE_SECONDS", String(91 * 24 * 60 * 60)],
    ["BULLMQ_RELAY_BATCH_SIZE", "1001"],
    ["BULLMQ_RELAY_POLL_INTERVAL_MS", "99"],
  ])("rejects out-of-range %s=%s", (field, value) => {
    expect(() => parseBullMqConfig({ [field]: value }))
      .toThrowError(expect.objectContaining({ field }));
  });

  it("enforces lock and relay cross-field invariants", () => {
    expect(() => parseBullMqConfig({ BULLMQ_LOCK_DURATION_MS: "10000", BULLMQ_LOCK_RENEW_TIME_MS: "6000" }))
      .toThrowError(expect.objectContaining({ field: "BULLMQ_LOCK_RENEW_TIME_MS" }));
    expect(() => parseBullMqConfig({ BULLMQ_LOCK_DURATION_MS: "10000", BULLMQ_LOCK_RENEW_TIME_MS: "5000", BULLMQ_STALLED_INTERVAL_MS: "11000" }))
      .toThrowError(expect.objectContaining({ field: "BULLMQ_STALLED_INTERVAL_MS" }));
    expect(() => parseBullMqConfig({ BULLMQ_RELAY_BATCH_SIZE: "4", BULLMQ_RELAY_CONCURRENCY: "5" }))
      .toThrowError(expect.objectContaining({ field: "BULLMQ_RELAY_CONCURRENCY" }));
    expect(() => parseBullMqConfig({ BULLMQ_CONNECT_TIMEOUT_MS: "5000", BULLMQ_RELAY_POLL_INTERVAL_MS: "1000", BULLMQ_RELAY_CLAIM_TTL_MS: "6000" }))
      .toThrowError(expect.objectContaining({ field: "BULLMQ_RELAY_CLAIM_TTL_MS" }));
  });

  it("uses bounded commercial defaults", () => {
    const config = parseBullMqConfig({});
    expect(config.worker).toEqual({
      concurrency: BULLMQ_CONFIG_DEFAULTS.workerConcurrency,
      lockDurationMs: BULLMQ_CONFIG_DEFAULTS.lockDurationMs,
      lockRenewTimeMs: BULLMQ_CONFIG_DEFAULTS.lockRenewTimeMs,
      stalledIntervalMs: BULLMQ_CONFIG_DEFAULTS.stalledIntervalMs,
      maxStalledCount: BULLMQ_CONFIG_DEFAULTS.maxStalledCount,
    });
    expect(config.relay.concurrency).toBeLessThanOrEqual(config.relay.batchSize);
  });
});
