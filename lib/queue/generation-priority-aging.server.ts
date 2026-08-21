import type { GenerationQueueLike } from "@/lib/queue/generation-queue.server";
import {
  AGED_STANDARD_GENERATION_PRIORITY,
  STANDARD_GENERATION_PRIORITY,
  VIP_GENERATION_PRIORITY,
} from "@/lib/queue/generation-priorities";

export const AGED_STANDARD_PRIORITY = AGED_STANDARD_GENERATION_PRIORITY;
export const VIP_PRIORITY = VIP_GENERATION_PRIORITY;
export const STANDARD_PRIORITY = STANDARD_GENERATION_PRIORITY;
export const STANDARD_PRIORITY_AGING_MS = 2 * 60_000;

export type GenerationPriorityAgingMetric = {
  event: "priority.aging.batch" | "priority.aging.error";
  timestamp: string;
  scanned?: number;
  promoted?: number;
  reason?: string;
};

export async function runGenerationPriorityAgingBatch(options: {
  queue: GenerationQueueLike;
  scanLimit?: number;
  now?: () => number;
}) {
  const getPrioritized = options.queue.getPrioritized;
  const getCountsPerPriority = options.queue.getCountsPerPriority;
  if (!getPrioritized || !getCountsPerPriority) {
    throw new Error("[generation-priority] queue does not support priority-aware scans");
  }
  const scanLimit = Math.min(2_000, Math.max(1, Math.floor(options.scanLimit || 500)));
  const now = options.now?.() ?? Date.now();
  const higherPriorityCounts = await getCountsPerPriority.call(options.queue, [AGED_STANDARD_PRIORITY, VIP_PRIORITY]);
  const standardStart = [AGED_STANDARD_PRIORITY, VIP_PRIORITY]
    .reduce((total, priority) => total + Math.max(0, Number(higherPriorityCounts[String(priority)]) || 0), 0);
  const jobs = await getPrioritized.call(options.queue, standardStart, standardStart + scanLimit - 1);
  let promoted = 0;
  for (const job of jobs) {
    if (job.data?.schemaVersion !== 1
      || job.data.serviceTier !== "standard"
      || now - job.timestamp < STANDARD_PRIORITY_AGING_MS
      || job.opts.priority === AGED_STANDARD_PRIORITY) continue;
    await job.changePriority({ priority: AGED_STANDARD_PRIORITY });
    promoted += 1;
  }
  return { scanned: jobs.length, promoted };
}

export async function runGenerationPriorityAgingLoop(options: {
  queue: GenerationQueueLike;
  control: { isStopping: () => boolean };
  intervalMs?: number;
  scanLimit?: number;
  sleep?: (ms: number) => Promise<void>;
  onMetric?: (metric: GenerationPriorityAgingMetric) => void;
  now?: () => Date;
}) {
  const intervalMs = Math.min(60_000, Math.max(5_000, Math.floor(options.intervalMs || 15_000)));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  while (!options.control.isStopping()) {
    try {
      const result = await runGenerationPriorityAgingBatch({
        queue: options.queue,
        scanLimit: options.scanLimit,
        now: () => now().getTime(),
      });
      options.onMetric?.({ event: "priority.aging.batch", timestamp: now().toISOString(), ...result });
    } catch (error) {
      options.onMetric?.({
        event: "priority.aging.error",
        timestamp: now().toISOString(),
        reason: error instanceof Error ? error.message : "priority aging failed",
      });
    }
    if (!options.control.isStopping()) await sleep(intervalMs);
  }
}
