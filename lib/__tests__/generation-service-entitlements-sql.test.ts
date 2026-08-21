import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822100000_generation_service_entitlements.sql"),
  "utf8",
);

function functionSql(name: string, nextName?: string) {
  const markers = [
    `CREATE OR REPLACE FUNCTION public.${name}`,
    `CREATE FUNCTION public.${name}`,
    `CREATE OR REPLACE FUNCTION private.${name}`,
  ];
  const start = markers
    .map((marker) => migration.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  if (!nextName) return migration.slice(start);
  const next = migration.indexOf(nextName, start + 1);
  return migration.slice(start, next < 0 ? undefined : next);
}

describe("generation service entitlement migration", () => {
  it("derives VIP only from a current business or premium subscription", () => {
    const sql = functionSql("resolve_generation_service_tier", "assign_generation_service_tier_and_admit");
    expect(sql).toContain("public.stripe_subscriptions");
    expect(sql).toContain("public.billing_products");
    expect(sql).toContain("subscription.status IN ('active', 'trialing')");
    expect(sql).toContain("subscription.current_period_end > now()");
    expect(sql).toContain("product.tier_key IN ('business', 'premium')");
    expect(sql).toContain("THEN 'vip'::TEXT ELSE 'standard'::TEXT");
  });

  it("stores a server-controlled tier and enforces non-bypassable 12/30 visible task caps", () => {
    const sql = functionSql("assign_generation_service_tier_and_admit", "create_generation_with_credit_debit_v2");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS service_tier TEXT NOT NULL DEFAULT 'standard'");
    expect(sql).toContain("NEW.service_tier := private.resolve_generation_service_tier(NEW.user_id)");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("NEW.service_tier = 'vip' THEN 30 ELSE 12");
    expect(sql).toContain("ACTIVE_JOB_LIMIT_EXCEEDED:%:%");
    expect(sql).toContain("COALESCE(generation.job_payload ->> 'internalTask', 'false') <> 'true'");
    expect(migration).toContain("BEFORE INSERT ON public.generations");
  });

  it("excludes trusted hidden children without exposing an authenticated bypass", () => {
    const triggerSql = functionSql("assign_generation_service_tier_and_admit", "create_generation_with_credit_debit_v2");
    const debitSql = functionSql("create_generation_with_credit_debit_v2", "claim_generation_job");
    expect(triggerSql).toContain("COALESCE(NEW.job_payload ->> 'internalTask', 'false') = 'true'");
    expect(debitSql).toContain("INTERNAL_GENERATION_REQUIRES_TRUSTED_RPC");
    expect(debitSql).toContain("v_effective_visible_limit := LEAST(p_max_active_jobs, v_service_limit)");
    expect(debitSql).toContain("v_effective_visible_limit + v_internal_active_jobs");
    expect(debitSql).toContain("TO authenticated");
  });

  it("returns tier-aware BullMQ priorities while preserving bounded per-tenant relay fairness", () => {
    const claimSql = functionSql("claim_generation_outbox", "get_generation_service_entitlement");
    expect(claimSql).toContain("service_tier TEXT");
    expect(claimSql).toContain("queue_priority INTEGER");
    expect(claimSql).toContain("PARTITION BY ready.user_id");
    expect(claimSql).toContain("v_candidate_limit := LEAST(GREATEST(p_limit * 16, 64), 8000)");
    expect(claimSql).toContain("generation.created_at <= v_now - interval '2 minutes' THEN 5");
    expect(claimSql).toContain("generation.service_tier = 'vip' THEN 2");
    expect(claimSql).toContain("ELSE 20");
    expect(claimSql).toContain("FOR UPDATE OF outbox SKIP LOCKED");
  });

  it("returns the authenticated caller's complete standard or VIP entitlement", () => {
    const sql = functionSql("get_generation_service_entitlement", "settle_generation_for_ai_capacity");
    expect(sql).toContain("v_user_id UUID := auth.uid()");
    expect(sql).toContain("AUTHENTICATION_REQUIRED");
    expect(sql).toContain("v_tier = 'vip' THEN 30 ELSE 12");
    expect(sql).toContain("v_tier = 'vip' THEN 8 ELSE 4");
    expect(sql).toContain("v_tier = 'vip' THEN 4 ELSE 2");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_generation_service_entitlement()\n  TO authenticated");
  });

  it("bounds capacity waiting by wall clock at 10 minutes with at most 60-second delays", () => {
    const sql = functionSql("settle_generation_for_ai_capacity", "get_runtime_contract_version");
    expect(sql).not.toContain("v_next_count > 10");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql.match(/LEAST\(\s*60,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("job_attempts = GREATEST(COALESCE(generation.job_attempts, 0) - 1, 0)");
    expect(sql).toContain("STALE_EXECUTION_FENCE");
    expect(sql).toContain("模型容量排队超时退款");
    expect(sql).toContain("ON CONFLICT (generation_id, delivery_version) DO NOTHING");
  });

  it("keeps tenant fairness waits separate from provider capacity settlement", () => {
    const sql = functionSql("settle_generation_for_tenant_capacity", "fail_generation_on_dead_outbox");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.settle_generation_for_tenant_capacity");
    expect(sql).toContain("queue_reason = 'tenant_capacity'");
    expect(sql).toContain("tenant_capacity_defer_count = COALESCE(generation.tenant_capacity_defer_count, 0) + 1");
    expect(sql).toContain("tenant_capacity_first_deferred_at");
    expect(sql).toContain("COALESCE(\n    v_generation.tenant_capacity_first_deferred_at,");
    expect(sql).toContain("capacity_first_deferred_at = v_first_deferred_at");
    expect(sql).toContain("账户并发排队超时退款");
    expect(sql).not.toContain("模型容量排队超时退款");
    expect(sql).toContain("job_attempts = GREATEST(COALESCE(generation.job_attempts, 0) - 1, 0)");
  });

  it("publishes the exact forward runtime contract", () => {
    expect(migration).toContain("'2026-08-22.6'::TEXT");
    expect(migration).toContain("'f6989e953f92e638603f8369bf5d10cbfb651dfc8145417ccb096ef1a40aeedf'::TEXT");
  });

  it("keeps every new privileged function on an empty search path", () => {
    const definitions = migration.match(/CREATE(?: OR REPLACE)? FUNCTION (?:public|private)\.[\s\S]*?\$\$;/g) ?? [];
    expect(definitions.length).toBeGreaterThanOrEqual(7);
    for (const definition of definitions) {
      expect(definition).toContain("SECURITY DEFINER");
      expect(definition).toContain("SET search_path = ''");
    }
  });

  it("settles charged generations when a delivery becomes dead", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.fail_generation_on_dead_outbox()");
    expect(migration).toContain("CREATE TRIGGER generation_job_outbox_dead_settlement");
    expect(migration).toContain("queue_reason = 'dispatch_failed'");
    expect(migration).toContain("任务投递失败退款");
    expect(migration).toContain("g.delivery_version = NEW.delivery_version");
  });
});
