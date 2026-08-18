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

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}
