import { hostname } from "node:os";
import IORedis from "ioredis";
import { parseBullMqConfig, type BullMqRuntimeConfig } from "@/lib/queue/bullmq-config.server";

const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TTL_SECONDS = 35;

export type WorkerHeartbeat = {
  instanceId: string;
  hostname: string;
  pid: number;
  release: string;
  startedAt: string;
  lastSeenAt: string;
  concurrency: number;
};

export function createWorkerHeartbeat(config: BullMqRuntimeConfig) {
  if (!config.connections) throw new Error("Worker heartbeat requires BullMQ Redis");
  const client = new IORedis({ ...config.connections.observer, lazyConnect: true });
  client.on("error", () => undefined);
  const startedAt = new Date().toISOString();
  const hostId = normalizeInstanceId(hostname()) || "worker";
  const processId = normalizeInstanceId(process.env.PM2_INSTANCE_ID) || String(process.pid);
  const instanceId = `${hostId}-${processId}`;
  const key = `${config.prefix}:worker-heartbeat:${instanceId}`;
  let timer: ReturnType<typeof setInterval> | null = null;
  let writing = false;

  async function write() {
    if (writing) return;
    writing = true;
    try {
      const heartbeat: WorkerHeartbeat = {
        instanceId,
        hostname: hostname(),
        pid: process.pid,
        release: process.env.RELEASE_VERSION || process.env.TAG_NAME || process.cwd().split("/").pop() || "unknown",
        startedAt,
        lastSeenAt: new Date().toISOString(),
        concurrency: config.worker.concurrency,
      };
      await client.set(key, JSON.stringify(heartbeat), "EX", HEARTBEAT_TTL_SECONDS);
    } finally {
      writing = false;
    }
  }

  return {
    async start() {
      if (client.status === "wait") await client.connect();
      await write();
      timer = setInterval(() => void write().catch(() => undefined), HEARTBEAT_INTERVAL_MS);
      timer.unref?.();
    },
    async close() {
      if (timer) clearInterval(timer);
      if (client.status === "ready") await client.del(key).catch(() => undefined);
      client.disconnect();
    },
  };
}

export async function getWorkerHeartbeats(options: { config?: BullMqRuntimeConfig; timeoutMs?: number } = {}): Promise<WorkerHeartbeat[]> {
  const config = options.config ?? parseBullMqConfig();
  if (!config.enabled || !config.connections) return [];
  const client = new IORedis({ ...config.connections.observer, lazyConnect: true });
  client.on("error", () => undefined);
  const pattern = `${config.prefix}:worker-heartbeat:*`;
  try {
    await client.connect();
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, page] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      keys.push(...page.slice(0, Math.max(0, 500 - keys.length)));
    } while (cursor !== "0" && keys.length < 500);
    if (!keys.length) return [];
    const values = await withTimeout(client.mget(keys), options.timeoutMs ?? 5_000);
    const cutoff = Date.now() - HEARTBEAT_TTL_SECONDS * 1000;
    return values.map(parseHeartbeat).filter((item): item is WorkerHeartbeat => item !== null && Date.parse(item.lastSeenAt) >= cutoff)
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  } finally {
    client.disconnect();
  }
}

function parseHeartbeat(value: string | null): WorkerHeartbeat | null {
  if (!value) return null;
  try {
    const item = JSON.parse(value) as Partial<WorkerHeartbeat>;
    if (!item.instanceId || !item.hostname || !item.lastSeenAt || !Number.isInteger(item.pid) || !Number.isInteger(item.concurrency)) return null;
    return {
      instanceId: item.instanceId,
      hostname: item.hostname,
      pid: item.pid!,
      release: item.release || "unknown",
      startedAt: item.startedAt || item.lastSeenAt,
      lastSeenAt: item.lastSeenAt,
      concurrency: item.concurrency!,
    };
  } catch {
    return null;
  }
}

function normalizeInstanceId(value: string | undefined) {
  const normalized = value?.trim() || "";
  return /^[A-Za-z0-9._-]{1,128}$/.test(normalized) ? normalized : "";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Worker heartbeat read timed out")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
