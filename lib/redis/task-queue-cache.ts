import { Redis } from "@upstash/redis";

import type { TaskQueueItem, TaskQueueSummary } from "@/lib/task-queue";
import {
  TASK_QUEUE_ITEM_TTL_SECONDS,
  TASK_QUEUE_MODULE_CACHE_LIMIT,
  TASK_QUEUE_SUMMARY_TTL_SECONDS,
  applyStaleRunningFallback,
  emptyTaskQueueSummary,
} from "@/lib/task-queue-index";

type CacheReadResult<T> =
  | { hit: true; value: T }
  | { hit: false; value: T; reason?: string };

let taskQueueRedis: Redis | null | undefined;
const lastModuleTrimAt = new Map<string, number>();
const lastSummaryInvalidationAt = new Map<string, number>();
const MODULE_TRIM_MIN_INTERVAL_MS = 5 * 60 * 1000;
const SUMMARY_INVALIDATION_MIN_INTERVAL_MS = 15 * 1000;

export function getTaskQueueRedis(): Redis | null {
  if (taskQueueRedis !== undefined) {
    return taskQueueRedis;
  }
  if (!shouldUseTaskQueueRedis()) {
    taskQueueRedis = null;
    return taskQueueRedis;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    taskQueueRedis = null;
    return taskQueueRedis;
  }
  taskQueueRedis = new Redis({ url, token });
  return taskQueueRedis;
}

function shouldUseTaskQueueRedis() {
  return (process.env.TASK_QUEUE_CACHE_MODE || "redis").trim().toLowerCase() === "redis";
}

export async function getCachedTaskQueue(
  userId: string,
  module: string,
  limit: number,
): Promise<CacheReadResult<TaskQueueItem[]>> {
  const redis = getTaskQueueRedis();
  if (!redis) {
    return { hit: false, value: [], reason: "redis_unconfigured" };
  }
  try {
    const key = moduleZsetKey(userId, module);
    const ids = await (redis as any).zrange(key, 0, Math.max(0, limit - 1), { rev: true });
    const taskIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
    if (taskIds.length === 0) {
      return { hit: false, value: [], reason: "empty" };
    }

    const values = await (redis as any).mget(...taskIds.map((id) => itemKey(userId, id)));
    const items = (Array.isArray(values) ? values : [])
      .map(parseCachedTaskQueueItem)
      .filter((item): item is TaskQueueItem => Boolean(item))
      .map(applyStaleRunningFallback);
    return items.length > 0 ? { hit: true, value: items } : { hit: false, value: [], reason: "item_miss" };
  } catch (error) {
    console.warn("[task-queue-cache] read queue unavailable:", error);
    return { hit: false, value: [], reason: "error" };
  }
}

export async function writeTaskQueueItem(userId: string, item: TaskQueueItem): Promise<void> {
  const redis = getTaskQueueRedis();
  if (!redis) {
    return;
  }
  try {
    const score = Date.parse(item.createdAt || "") || Date.now();
    const key = itemKey(userId, item.id);
    const moduleKey = moduleZsetKey(userId, item.module);

    await (redis as any).set(key, item, { ex: TASK_QUEUE_ITEM_TTL_SECONDS });
    await (redis as any).zadd(moduleKey, { score, member: item.id });
    if (shouldTrimModuleZset(moduleKey)) {
      await trimModuleZset(redis, moduleKey);
    }

    await invalidateCachedTaskSummary(userId);
  } catch (error) {
    console.warn("[task-queue-cache] write item unavailable:", error);
  }
}

export async function warmTaskQueueCache(userId: string, module: string, items: TaskQueueItem[]): Promise<void> {
  const redis = getTaskQueueRedis();
  if (!redis || items.length === 0) {
    return;
  }
  try {
    const moduleKey = moduleZsetKey(userId, module);
    for (const rawItem of items.slice(0, TASK_QUEUE_MODULE_CACHE_LIMIT)) {
      const item = applyStaleRunningFallback(rawItem);
      const score = Date.parse(item.createdAt || "") || Date.now();
      await (redis as any).set(itemKey(userId, item.id), item, { ex: TASK_QUEUE_ITEM_TTL_SECONDS });
      await (redis as any).zadd(moduleKey, { score, member: item.id });
    }
    if (shouldTrimModuleZset(moduleKey)) {
      await trimModuleZset(redis, moduleKey);
    }
  } catch (error) {
    console.warn("[task-queue-cache] warm queue unavailable:", error);
  }
}

export async function getCachedTaskSummary(userId: string): Promise<CacheReadResult<TaskQueueSummary>> {
  const redis = getTaskQueueRedis();
  if (!redis) {
    return { hit: false, value: emptyTaskQueueSummary(), reason: "redis_unconfigured" };
  }
  try {
    const value = await (redis as any).hgetall(summaryKey(userId));
    if (!value || typeof value !== "object" || Object.keys(value).length === 0) {
      return { hit: false, value: emptyTaskQueueSummary(), reason: "empty" };
    }
    return { hit: true, value: parseSummaryHash(value) };
  } catch (error) {
    console.warn("[task-queue-cache] read summary unavailable:", error);
    return { hit: false, value: emptyTaskQueueSummary(), reason: "error" };
  }
}

export async function writeCachedTaskSummary(userId: string, summary: TaskQueueSummary): Promise<void> {
  const redis = getTaskQueueRedis();
  if (!redis) {
    return;
  }
  try {
    const key = summaryKey(userId);
    await (redis as any).hset(key, summary);
    await (redis as any).expire(key, TASK_QUEUE_SUMMARY_TTL_SECONDS);
  } catch (error) {
    console.warn("[task-queue-cache] write summary unavailable:", error);
  }
}

export async function invalidateCachedTaskSummary(userId: string): Promise<void> {
  const redis = getTaskQueueRedis();
  if (!redis || !shouldInvalidateCachedSummary(userId)) {
    return;
  }
  try {
    await (redis as any).del(summaryKey(userId));
  } catch (error) {
    console.warn("[task-queue-cache] invalidate summary unavailable:", error);
  }
}

async function trimModuleZset(redis: Redis, key: string) {
  await (redis as any).zremrangebyrank(key, 0, -TASK_QUEUE_MODULE_CACHE_LIMIT - 1);
}

function shouldTrimModuleZset(key: string) {
  return shouldRunThrottled(lastModuleTrimAt, key, MODULE_TRIM_MIN_INTERVAL_MS);
}

function shouldInvalidateCachedSummary(userId: string) {
  return shouldRunThrottled(lastSummaryInvalidationAt, userId, SUMMARY_INVALIDATION_MIN_INTERVAL_MS);
}

function shouldRunThrottled(cache: Map<string, number>, key: string, intervalMs: number) {
  const now = Date.now();
  const last = cache.get(key) || 0;
  if (now - last < intervalMs) {
    return false;
  }
  cache.set(key, now);
  return true;
}

function parseCachedTaskQueueItem(value: unknown): TaskQueueItem | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as TaskQueueItem;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return value as TaskQueueItem;
  }
  return null;
}

function parseSummaryHash(value: Record<string, unknown>): TaskQueueSummary {
  return {
    totalTaskNum: toNumber(value.totalTaskNum),
    finishedTaskNum: toNumber(value.finishedTaskNum),
    finishedNeedReadTaskNum: toNumber(value.finishedNeedReadTaskNum),
    runningTaskNum: toNumber(value.runningTaskNum),
    failedTaskNum: toNumber(value.failedTaskNum),
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function itemKey(userId: string, taskId: string) {
  return `taskq:item:${userId}:${taskId}`;
}

function moduleZsetKey(userId: string, module: string) {
  return `taskq:z:${userId}:module:${module}`;
}

function summaryKey(userId: string) {
  return `taskq:summary:${userId}`;
}
