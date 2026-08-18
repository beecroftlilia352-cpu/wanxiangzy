import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const script = readFileSync(
  resolve(projectRoot, "scripts/bullmq-load-recovery-test.mjs"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

describe("BullMQ load/recovery acceptance script", () => {
  it("requires explicit authorization and a dedicated Redis URL", () => {
    expect(script).toContain('env.ALLOW_QUEUE_LOAD_TEST !== "1"');
    expect(script).toContain("env.LOAD_TEST_REDIS_URL");
    expect(script).toContain("LOAD_TEST_REDIS_URL must not equal the application REDIS_URL");
    expect(script).toContain("refusing a Redis host whose name looks like production");
    expect(script).not.toMatch(/env\.REDIS_URL\s*\|\|/);
  });

  it("always generates an isolated random prefix and queue", () => {
    expect(script).toContain('randomBytes(8).toString("hex")');
    expect(script).toContain("const queueName = `wanxiangzy-loadtest-${runId}`");
    expect(script).toContain("const prefix = `wanxiangzy-loadtest-prefix-${runId}`");
    expect(script).toContain("await queue.obliterate({ force: true })");
    expect(script).not.toMatch(/\.flushall\s*\(/i);
    expect(script).not.toMatch(/\.flushdb\s*\(/i);
    expect(script).not.toMatch(/\.scan\s*\(/i);
  });

  it("covers concurrency, deduplication, delay, retry, latency, and leak assertions", () => {
    for (const contract of [
      "peakActive <= peakLimit",
      "duplicateStarts === 1",
      "delayViolations.length === 0",
      "retriedFailures === failureJobs",
      "waiting === 0",
      "activeCount === 0",
      "delayed === 0",
      "terminalFailed === 0",
      "throughputJobsPerSecond",
      "p50: percentile",
      "p95: percentile",
      "p99: percentile",
    ]) {
      expect(script).toContain(contract);
    }
  });

  it("exposes the npm acceptance command", () => {
    expect(packageJson.scripts?.["queue:load-test"]).toBe(
      "node scripts/bullmq-load-recovery-test.mjs",
    );
  });
});
