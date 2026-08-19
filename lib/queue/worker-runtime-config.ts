export const WORKER_RUNTIME_CONFIG_KEY = "worker.runtime.v1";
export const WORKER_RUNTIME_SCHEMA_VERSION = 1 as const;

export type WorkerRuntimeConfig = {
  schemaVersion: typeof WORKER_RUNTIME_SCHEMA_VERSION;
  desiredInstances: number;
  workerConcurrency: number;
  relayConcurrency: number;
  alertWaiting: number;
  alertOldestPendingSeconds: number;
  updatedAt?: string;
};

export type WorkerRuntimeAlertStatus = {
  breached: boolean;
  reasons: string[];
  waiting: {
    current: number | null;
    threshold: number;
    breached: boolean;
  };
  oldestPending: {
    currentSeconds: number | null;
    thresholdSeconds: number;
    breached: boolean;
  };
};

export const DEFAULT_WORKER_RUNTIME_CONFIG: WorkerRuntimeConfig = {
  schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
  desiredInstances: 1,
  workerConcurrency: 16,
  relayConcurrency: 8,
  alertWaiting: 100,
  alertOldestPendingSeconds: 300,
};

export function parseWorkerRuntimeConfig(value: unknown): WorkerRuntimeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_WORKER_RUNTIME_CONFIG };
  }
  const raw = value as Record<string, unknown>;
  return {
    schemaVersion: WORKER_RUNTIME_SCHEMA_VERSION,
    desiredInstances: bounded(raw.desiredInstances, DEFAULT_WORKER_RUNTIME_CONFIG.desiredInstances, 1, 32),
    workerConcurrency: bounded(raw.workerConcurrency, DEFAULT_WORKER_RUNTIME_CONFIG.workerConcurrency, 1, 512),
    relayConcurrency: bounded(raw.relayConcurrency, DEFAULT_WORKER_RUNTIME_CONFIG.relayConcurrency, 1, 128),
    alertWaiting: bounded(raw.alertWaiting, DEFAULT_WORKER_RUNTIME_CONFIG.alertWaiting, 1, 1_000_000),
    alertOldestPendingSeconds: bounded(raw.alertOldestPendingSeconds, DEFAULT_WORKER_RUNTIME_CONFIG.alertOldestPendingSeconds, 30, 86_400),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

export function validateWorkerRuntimeConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { config: null, error: "config 必须是 JSON object" } as const;
  }
  const raw = value as Record<string, unknown>;
  const fields: Array<[keyof WorkerRuntimeConfig, number, number]> = [
    ["desiredInstances", 1, 32],
    ["workerConcurrency", 1, 512],
    ["relayConcurrency", 1, 128],
    ["alertWaiting", 1, 1_000_000],
    ["alertOldestPendingSeconds", 30, 86_400],
  ];
  for (const [field, minimum, maximum] of fields) {
    const number = Number(raw[field]);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      return { config: null, error: `${field} 必须是 ${minimum}-${maximum} 的整数` } as const;
    }
  }
  return {
    config: parseWorkerRuntimeConfig({ ...raw, updatedAt: new Date().toISOString() }),
    error: null,
  } as const;
}

export function getWorkerRuntimeDrift(input: {
  desired: WorkerRuntimeConfig;
  onlineInstances: number | null;
  workerConcurrency: number;
  relayConcurrency: number;
}) {
  const reasons: string[] = [];
  if (input.onlineInstances !== null && input.onlineInstances !== input.desired.desiredInstances) {
    reasons.push(`实例数期望 ${input.desired.desiredInstances}，在线 ${input.onlineInstances}`);
  }
  if (input.workerConcurrency !== input.desired.workerConcurrency) {
    reasons.push(`Worker 并发期望 ${input.desired.workerConcurrency}，当前 ${input.workerConcurrency}`);
  }
  if (input.relayConcurrency !== input.desired.relayConcurrency) {
    reasons.push(`Relay 并发期望 ${input.desired.relayConcurrency}，当前 ${input.relayConcurrency}`);
  }
  return reasons;
}

export function getWorkerRuntimeAlerts(input: {
  desired: WorkerRuntimeConfig;
  waiting: number | null;
  oldestPendingSeconds: number | null;
}): WorkerRuntimeAlertStatus {
  const waiting = nullableNonNegativeInteger(input.waiting);
  const oldestPendingSeconds = nullableNonNegativeInteger(input.oldestPendingSeconds);
  const waitingBreached = waiting !== null && waiting >= input.desired.alertWaiting;
  const oldestPendingBreached = oldestPendingSeconds !== null
    && oldestPendingSeconds >= input.desired.alertOldestPendingSeconds;
  const reasons: string[] = [];

  if (waitingBreached) {
    reasons.push(`BullMQ 等待任务 ${waiting}，达到告警阈值 ${input.desired.alertWaiting}`);
  }
  if (oldestPendingBreached) {
    reasons.push(`Outbox 最老待发布任务 ${oldestPendingSeconds} 秒，达到告警阈值 ${input.desired.alertOldestPendingSeconds} 秒`);
  }

  return {
    breached: reasons.length > 0,
    reasons,
    waiting: {
      current: waiting,
      threshold: input.desired.alertWaiting,
      breached: waitingBreached,
    },
    oldestPending: {
      currentSeconds: oldestPendingSeconds,
      thresholdSeconds: input.desired.alertOldestPendingSeconds,
      breached: oldestPendingBreached,
    },
  };
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function nullableNonNegativeInteger(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}
