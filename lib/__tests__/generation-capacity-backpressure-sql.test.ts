import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821123000_generation_capacity_backpressure.sql"),
  "utf8",
);

describe("generation capacity backpressure migration", () => {
  it("separates queue waiting from terminal errors and bounds capacity deferrals", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS queue_reason TEXT");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS capacity_defer_count INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.settle_generation_for_ai_capacity");
    expect(migration).toContain("v_next_count >= 12");
    expect(migration).toContain("interval '30 minutes'");
    expect(migration).toContain("error_message = NULL");
    expect(migration).toContain("INSERT INTO private.generation_job_outbox");
    expect(migration).toContain("模型容量排队超时退款");
  });

  it("provides one locked and idempotent admin terminal settlement", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_settle_generation");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("'already_terminal'::TEXT");
    expect(migration).toContain("delivery_version = g.delivery_version + 1");
    expect(migration).toContain("管理员任务结算退款");
  });

  it("persists transient provider retries and provides target-specific admin requeue", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.settle_generation_for_retryable_error");
    expect(migration).toContain("queue_reason = 'retryable_error'");
    expect(migration).toContain("生成服务重试耗尽退款");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_retry_generation");
    expect(migration).toContain("'already_running'::TEXT");
    expect(migration).toContain("queue_reason = 'admin_retry'");
  });

  it("publishes the matching runtime contract", () => {
    expect(migration).toContain("'2026-08-21.2'::TEXT");
    expect(migration).toContain("'c15cb3e0cf66c8f3333bde1e2c98051aa9534a018e196ab2fa87e011ff5da285'::TEXT");
  });
});
