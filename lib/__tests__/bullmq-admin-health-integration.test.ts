import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("BullMQ admin health integration", () => {
  it("adds live BullMQ counts and reachability to the model-control snapshot", () => {
    const route = read("app/api/admin/model-control/route.ts");

    expect(route).toContain("getGenerationBullMqHealth()");
    expect(route).toContain("bullmq: {");
    for (const field of ["reachable:", "latencyMs:", "workers:", "waiting:", "active:", "delayed:", "failed:"]) {
      expect(route, field).toContain(field);
    }
    expect(route).not.toContain("error: bullmqHealth.error");
    expect(route).not.toMatch(/redisUrl\s*:/i);
  });

  it("renders the operational BullMQ signals as overview cards", () => {
    const component = read("components/admin/AdminModelControlPlane.tsx");

    expect(component).toContain("BullMQ 可达性");
    expect(component).toContain("BullMQ 等待");
    expect(component).toContain("BullMQ 执行中");
    expect(component).toContain("BullMQ 延迟");
    expect(component).toContain("BullMQ 失败");
    expect(component).toContain("bullmqHealth?.latencyMs");
    expect(component).toContain("bullmqHealth?.workers");
  });

  it("applies published Worker alert thresholds to live queue health", () => {
    const data = read("lib/admin/data.ts");
    const page = read("app/admin/workers/page.tsx");

    expect(data).toContain("getWorkerRuntimeAlerts({");
    expect(data).toContain("waiting: useBullMqCounts ? bullmqHealth.counts.waiting : null");
    expect(data).toContain("oldestPendingSeconds: outboxResult.error ? null : outboxHealth.oldest_pending_age_seconds ?? 0");
    expect(data).toContain("warnings.push(...runtimeAlerts.reasons)");
    expect(page).toContain("BullMQ Waiting");
    expect(page).toContain("Outbox 最老待发布");
    expect(page).toContain("overview.runtime.alerts.reasons");
  });
});
