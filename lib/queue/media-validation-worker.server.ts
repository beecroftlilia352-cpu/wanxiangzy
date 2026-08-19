import { createHash, createHmac } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getAdminClient } from "@/lib/supabase/admin";
import { emptyQueueDelayMs } from "@/lib/queue/queue-backoff";

const execFileAsync = promisify(execFile);

export interface MediaValidationDatabase {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
}

export type MediaValidationJob = {
  jobId: string;
  assetId: string;
  ownerUserId: string;
  objectKey: string;
  bucketName: string;
  expectedSha256: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
  assetFenceVersion: number;
  leaseToken: string;
  leaseVersion: number;
  attempts: number;
};

export type MediaValidationObservation = {
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
  durationMs: number;
  formatName: string;
};

export type MediaValidationMetric = {
  event:
    | "media_validation.batch"
    | "media_validation.verified"
    | "media_validation.quarantined"
    | "media_validation.deferred"
    | "media_validation.dead"
    | "media_validation.recovery"
    | "media_validation.error";
  timestamp: string;
  jobId?: string;
  assetId?: string;
  count?: number;
  reason?: string;
  durationMs?: number;
};

export type MediaValidationConfig = {
  batchSize: number;
  concurrency: number;
  pollIntervalMs: number;
  maxPollIntervalMs: number;
  leaseSeconds: number;
  maxBytes: number;
  ffprobeTimeoutMs: number;
  recoveryIntervalMs: number;
  workerId: string;
};

export type MediaValidationControl = { isStopping: () => boolean };

export class MediaValidationError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export function parseMediaValidationConfig(env: NodeJS.ProcessEnv = process.env): MediaValidationConfig {
  return {
    batchSize: intEnv(env.MEDIA_VALIDATION_BATCH_SIZE, 1, 100, 12),
    concurrency: intEnv(env.MEDIA_VALIDATION_CONCURRENCY, 1, 32, 4),
    pollIntervalMs: intEnv(env.MEDIA_VALIDATION_POLL_INTERVAL_MS, 100, 30_000, 1_000),
    maxPollIntervalMs: intEnv(env.MEDIA_VALIDATION_MAX_POLL_INTERVAL_MS, 1_000, 300_000, 30_000),
    leaseSeconds: intEnv(env.MEDIA_VALIDATION_LEASE_SECONDS, 30, 900, 180),
    maxBytes: intEnv(env.MEDIA_VALIDATION_MAX_BYTES, 1_048_576, 2_147_483_648, 536_870_912),
    ffprobeTimeoutMs: intEnv(env.MEDIA_VALIDATION_FFPROBE_TIMEOUT_MS, 1_000, 120_000, 30_000),
    recoveryIntervalMs: intEnv(env.MEDIA_VALIDATION_RECOVERY_INTERVAL_MS, 5_000, 300_000, 300_000),
    workerId: (env.MEDIA_VALIDATION_WORKER_ID || `media-validator-${process.pid}`).trim().slice(0, 128),
  };
}

export async function runMediaValidationBatch(options: {
  database?: MediaValidationDatabase;
  config?: MediaValidationConfig;
  inspect?: (job: MediaValidationJob, config: MediaValidationConfig) => Promise<MediaValidationObservation>;
  onMetric?: (metric: MediaValidationMetric) => void;
  now?: () => Date;
}) {
  const database = options.database ?? (getAdminClient() as unknown as MediaValidationDatabase);
  const config = options.config ?? parseMediaValidationConfig();
  const inspect = options.inspect ?? inspectMediaValidationObject;
  const { data, error } = await database.rpc("claim_media_validation_jobs", {
    p_limit: Math.min(config.batchSize, config.concurrency),
    p_lease_seconds: config.leaseSeconds,
    p_worker_id: config.workerId,
  });
  if (error) throw new Error(`claim media validation jobs failed: ${error.message || "unknown database error"}`);
  const jobs = parseValidationJobs(data);
  const outcomes = await runBounded(jobs, config.concurrency, (job) => settleValidationJob({
    database,
    config,
    job,
    inspect,
    onMetric: options.onMetric,
    now: options.now,
  }));
  emit(options, { event: "media_validation.batch", count: jobs.length });
  return {
    claimed: jobs.length,
    verified: outcomes.filter((value) => value === "verified").length,
    quarantined: outcomes.filter((value) => value === "quarantined").length,
    deferred: outcomes.filter((value) => value === "deferred").length,
    dead: outcomes.filter((value) => value === "dead").length,
  };
}

export async function runMediaValidationLoop(options: {
  database?: MediaValidationDatabase;
  config?: MediaValidationConfig;
  control: MediaValidationControl;
  onMetric?: (metric: MediaValidationMetric) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}) {
  const database = options.database ?? (getAdminClient() as unknown as MediaValidationDatabase);
  const config = options.config ?? parseMediaValidationConfig();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastRecovery = 0;
  let consecutiveEmpty = 0;
  while (!options.control.isStopping()) {
    const current = (options.now ?? (() => new Date()))().getTime();
    if (current - lastRecovery >= config.recoveryIntervalMs) {
      try {
        const { data, error } = await database.rpc("recover_media_validation_jobs", { p_limit: config.batchSize * 4 });
        if (error) throw new Error(error.message || "unknown database error");
        const row = firstRecord(data);
        emit(options, {
          event: "media_validation.recovery",
          count: numberValue(row?.recovered_leases) + numberValue(row?.repaired_missing) + numberValue(row?.dead_lettered),
        });
      } catch (error) {
        emit(options, { event: "media_validation.error", reason: safeMessage(error) });
      }
      lastRecovery = current;
    }
    try {
      const result = await runMediaValidationBatch({ database, config, onMetric: options.onMetric, now: options.now });
      if (result.claimed > 0) {
        consecutiveEmpty = 0;
        continue;
      }
    } catch (error) {
      emit(options, { event: "media_validation.error", reason: safeMessage(error) });
    }
    if (!options.control.isStopping()) {
      consecutiveEmpty += 1;
      await sleep(emptyQueueDelayMs(consecutiveEmpty, config.pollIntervalMs, config.maxPollIntervalMs));
    }
  }
}

async function settleValidationJob(options: {
  database: MediaValidationDatabase;
  config: MediaValidationConfig;
  job: MediaValidationJob;
  inspect: (job: MediaValidationJob, config: MediaValidationConfig) => Promise<MediaValidationObservation>;
  onMetric?: (metric: MediaValidationMetric) => void;
  now?: () => Date;
}) {
  const startedAt = Date.now();
  let leaseLost = false;
  let heartbeatRunning = false;
  const heartbeat = async () => {
    if (heartbeatRunning || leaseLost) return;
    heartbeatRunning = true;
    try {
      const { data, error } = await options.database.rpc("heartbeat_media_validation_job", {
        p_job_id: options.job.jobId,
        p_lease_token: options.job.leaseToken,
        p_lease_version: options.job.leaseVersion,
        p_lease_seconds: options.config.leaseSeconds,
      });
      if (error || data !== true) leaseLost = true;
    } finally {
      heartbeatRunning = false;
    }
  };
  const timer = setInterval(() => void heartbeat(), Math.max(10_000, Math.floor(options.config.leaseSeconds * 1_000 / 3)));
  timer.unref?.();
  try {
    const observed = await options.inspect(options.job, options.config);
    if (leaseLost) throw new MediaValidationError("media validation lease was lost", true);
    const { data, error } = await options.database.rpc("complete_media_validation_job", {
      p_job_id: options.job.jobId,
      p_lease_token: options.job.leaseToken,
      p_lease_version: options.job.leaseVersion,
      p_observed_sha256: observed.sha256,
      p_observed_size_bytes: observed.sizeBytes,
      p_observed_mime_type: observed.mimeType,
      p_width: observed.width,
      p_height: observed.height,
      p_duration_ms: observed.durationMs,
      p_validation_result: { validator: "ffprobe", formatName: observed.formatName },
    });
    if (error) throw new MediaValidationError(`complete media validation failed: ${error.message || "unknown"}`, true);
    const completed = firstRecord(data);
    const outcome = completed?.metadata_matches === true ? "verified" : "quarantined";
    emit(options, {
      event: outcome === "verified" ? "media_validation.verified" : "media_validation.quarantined",
      jobId: options.job.jobId,
      assetId: options.job.assetId,
      durationMs: Date.now() - startedAt,
    });
    return outcome;
  } catch (error) {
    const retryable = error instanceof MediaValidationError ? error.retryable : true;
    const { data, error: deferError } = await options.database.rpc("defer_media_validation_job", {
      p_job_id: options.job.jobId,
      p_lease_token: options.job.leaseToken,
      p_lease_version: options.job.leaseVersion,
      p_error: safeMessage(error).slice(0, 2_000),
      p_retryable: retryable,
      p_delay_seconds: retryable ? retryDelaySeconds(options.job.attempts) : 1,
    });
    if (deferError) throw new Error(`defer media validation failed: ${deferError.message || "unknown"}`);
    const status = String(data || "pending") === "dead" ? "dead" : "deferred";
    emit(options, {
      event: status === "dead" ? "media_validation.dead" : "media_validation.deferred",
      jobId: options.job.jobId,
      assetId: options.job.assetId,
      reason: safeMessage(error),
      durationMs: Date.now() - startedAt,
    });
    return status;
  } finally {
    clearInterval(timer);
  }
}

export async function inspectMediaValidationObject(
  job: MediaValidationJob,
  config: MediaValidationConfig,
): Promise<MediaValidationObservation> {
  const oss = getOssConfig();
  if (job.bucketName !== oss.bucket) {
    throw new MediaValidationError("media validation bucket is not in the configured allowlist", false);
  }
  const directory = await mkdtemp(join(tmpdir(), "media-validation-"));
  const path = join(directory, "asset.bin");
  try {
    const response = await fetch(buildOssUrl(oss.endpoint, job.objectKey), {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: signOssRequest(oss, "GET", job.objectKey, { "Accept-Encoding": "identity" }),
      signal: AbortSignal.timeout(Math.max(config.ffprobeTimeoutMs, 120_000)),
    });
    if (!response.ok || !response.body) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new MediaValidationError(`OSS validation GET HTTP ${response.status}`, retryable);
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > config.maxBytes) {
      await response.body.cancel().catch(() => undefined);
      throw new MediaValidationError("OSS validation object has an invalid or excessive size", false);
    }
    const hash = createHash("sha256");
    let total = 0;
    let prefix = Buffer.alloc(0);
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.length;
        if (total > config.maxBytes || total > declaredLength) {
          callback(new MediaValidationError("OSS validation stream exceeded its declared size", false));
          return;
        }
        hash.update(chunk);
        if (prefix.length < 64) prefix = Buffer.concat([prefix, chunk.subarray(0, 64 - prefix.length)]);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as never),
      limiter,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
    );
    if (total !== declaredLength) throw new MediaValidationError("OSS validation stream was truncated", true);
    const mimeType = sniffVideoMime(prefix);
    if (!mimeType) throw new MediaValidationError("media container signature is unsupported", false);
    const probe = await probeVideoFile(path, config.ffprobeTimeoutMs);
    return {
      sha256: hash.digest("hex"),
      sizeBytes: total,
      mimeType,
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationMs,
      formatName: probe.formatName,
    };
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError(`media validation execution failed: ${safeMessage(error)}`, isTransientIoError(error));
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function deleteAliyunOssRegistryObject(objectKey: string, bucketName: string) {
  const oss = getOssConfig();
  if (bucketName !== oss.bucket) {
    throw new MediaValidationError("media cleanup bucket is not in the configured allowlist", false);
  }
  const response = await fetch(buildOssUrl(oss.endpoint, objectKey), {
    method: "DELETE",
    cache: "no-store",
    redirect: "manual",
    headers: signOssRequest(oss, "DELETE", objectKey),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.ok || response.status === 404) return;
  throw new MediaValidationError(
    `OSS cleanup DELETE HTTP ${response.status}`,
    response.status === 408 || response.status === 429 || response.status >= 500,
  );
}

async function probeVideoFile(path: string, timeoutMs: number) {
  let stdout: string;
  try {
    const result = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "stream=codec_type,width,height:format=duration,format_name",
      "-of", "json",
      path,
    ], { timeout: timeoutMs, maxBuffer: 1_048_576, encoding: "utf8" });
    stdout = result.stdout;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    throw new MediaValidationError(`ffprobe rejected media: ${safeMessage(error)}`, code === "ETIMEDOUT");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new MediaValidationError("ffprobe returned malformed JSON", false);
  }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => firstRecordValue(stream, "codec_type") === "video") as Record<string, unknown> | undefined;
  const format = parsed.format && typeof parsed.format === "object" ? parsed.format as Record<string, unknown> : {};
  const width = numberValue(video?.width);
  const height = numberValue(video?.height);
  const durationSeconds = Number(format.duration);
  const durationMs = Math.round(durationSeconds * 1_000);
  const formatName = String(format.format_name || "").slice(0, 128);
  if (!Number.isInteger(width) || width < 1 || width > 100_000
      || !Number.isInteger(height) || height < 1 || height > 100_000
      || !Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > 86_400_000
      || !formatName) {
    throw new MediaValidationError("ffprobe media dimensions or duration are invalid", false);
  }
  return { width, height, durationMs, formatName };
}

function parseValidationJobs(value: unknown): MediaValidationJob[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    const job: MediaValidationJob = {
      jobId: String(row.job_id || ""), assetId: String(row.asset_id || ""),
      ownerUserId: String(row.owner_user_id || ""), objectKey: String(row.object_key || ""),
      bucketName: String(row.bucket_name || ""), expectedSha256: String(row.expected_sha256 || ""),
      expectedSizeBytes: numberValue(row.expected_size_bytes), expectedMimeType: String(row.expected_mime_type || ""),
      assetFenceVersion: numberValue(row.asset_fence_version), leaseToken: String(row.lease_token || ""),
      leaseVersion: numberValue(row.lease_version), attempts: numberValue(row.attempts),
    };
    if (!job.jobId || !job.assetId || !job.objectKey || !job.bucketName || !job.leaseToken
        || !Number.isSafeInteger(job.leaseVersion) || job.leaseVersion < 1) {
      throw new Error("media validation claim returned a malformed row");
    }
    return job;
  });
}

async function runBounded<T, R>(values: T[], concurrency: number, work: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await work(values[index]);
    }
  }));
  return results;
}

function getOssConfig() {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const endpoint = (process.env.ALIYUN_OSS_ENDPOINT?.trim() || (bucket && region ? `${bucket}.${region}.aliyuncs.com` : ""))
    .replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!accessKeyId || !accessKeySecret || !bucket || !region || endpoint !== `${bucket}.${region}.aliyuncs.com`) {
    throw new MediaValidationError("media validation OSS configuration is invalid", false);
  }
  return { accessKeyId, accessKeySecret, bucket, endpoint, securityToken: process.env.ALIYUN_OSS_SECURITY_TOKEN?.trim() };
}

function signOssRequest(
  config: ReturnType<typeof getOssConfig>,
  method: "GET" | "DELETE",
  objectKey: string,
  headers: Record<string, string> = {},
) {
  const date = new Date().toUTCString();
  const signedHeaders: Record<string, string> = { ...headers };
  if (config.securityToken) signedHeaders["x-oss-security-token"] = config.securityToken;
  const canonicalOssHeaders = Object.entries(signedHeaders)
    .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
    .filter(([name]) => name.startsWith("x-oss-"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`).join("");
  const signature = createHmac("sha1", config.accessKeySecret)
    .update([method, "", "", date, `${canonicalOssHeaders}/${config.bucket}/${objectKey}`].join("\n"))
    .digest("base64");
  return { ...signedHeaders, Authorization: `OSS ${config.accessKeyId}:${signature}`, Date: date };
}

function buildOssUrl(endpoint: string, objectKey: string) {
  if (!objectKey || objectKey.startsWith("/") || objectKey.includes("\\")
      || objectKey.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new MediaValidationError("media validation object key is invalid", false);
  }
  return `https://${endpoint}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function sniffVideoMime(prefix: Buffer) {
  if (prefix.length >= 12 && prefix.subarray(4, 8).toString("ascii") === "ftyp") {
    return prefix.subarray(8, 12).toString("ascii") === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (prefix.length >= 4 && prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3) {
    return "video/webm";
  }
  return null;
}

function emit(
  options: { onMetric?: (metric: MediaValidationMetric) => void; now?: () => Date },
  metric: Omit<MediaValidationMetric, "timestamp">,
) {
  options.onMetric?.({ ...metric, timestamp: (options.now ?? (() => new Date()))().toISOString() });
}

function retryDelaySeconds(attempts: number) {
  return Math.min(3_600, Math.max(5, 15 * Math.pow(2, Math.max(0, attempts - 1))));
}

function intEnv(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function firstRecord(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
}

function firstRecordValue(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientIoError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN" || code === "ENOSPC";
}
