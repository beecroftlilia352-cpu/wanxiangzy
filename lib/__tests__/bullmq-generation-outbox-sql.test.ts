import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(
    projectRoot,
    "supabase/migrations/20260818072132_bullmq_generation_outbox.sql",
  ),
  "utf8",
);
const productRetouchSchema = readFileSync(
  resolve(projectRoot, "supabase/product-retouch.sql"),
  "utf8",
);
const claimBenchmark = readFileSync(
  resolve(projectRoot, "scripts/explain-generation-outbox-claim.sql"),
  "utf8",
);

function functionSql(name: string, nextName?: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = nextName
    ? migration.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}(`, start)
    : migration.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("BullMQ generation outbox SQL contract", () => {
  it("uses a private, force-RLS outbox with service-role-only table access", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS private;");
    const dropOutbox = migration.indexOf(
      "DROP TABLE IF EXISTS private.generation_job_outbox;",
    );
    const createOutbox = migration.indexOf(
      "CREATE TABLE private.generation_job_outbox",
    );
    expect(dropOutbox).toBeGreaterThan(-1);
    expect(createOutbox).toBeGreaterThan(dropOutbox);
    expect(migration).toContain(
      "ALTER TABLE private.generation_job_outbox FORCE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "REVOKE ALL ON private.generation_job_outbox FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON private.generation_job_outbox TO service_role;",
    );
  });

  it("preserves the credit ledger while intentionally clearing old generation tasks", () => {
    const detachLedger = migration.indexOf(
      "UPDATE public.credit_logs\nSET generation_id = NULL",
    );
    const deleteTasks = migration.indexOf("DELETE FROM public.generations;");
    expect(detachLedger).toBeGreaterThan(-1);
    expect(deleteTasks).toBeGreaterThan(detachLedger);
    expect(migration).not.toContain("DELETE FROM public.credit_logs");
    expect(migration).not.toContain("DELETE FROM public.profiles");
  });

  it("makes the idempotent v2 RPC the only authenticated generation write path", () => {
    const sql = functionSql(
      "create_generation_with_credit_debit_v2",
      "claim_generation_outbox",
    );
    expect(sql).toContain("p_idempotency_key TEXT DEFAULT NULL");
    expect(sql).toContain("p_max_active_jobs INTEGER DEFAULT 20");
    expect(sql).toContain(
      "p_max_active_jobs IS NULL OR p_max_active_jobs NOT BETWEEN 1 AND 1000",
    );
    expect(sql).toContain(
      "RETURNS TABLE(generation_id UUID, credits_remaining INTEGER)",
    );
    expect(sql).toContain("IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint");
    expect(sql).toContain("RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'");
    const tenantLock = sql.indexOf("FROM public.profiles AS p\n  WHERE p.id = p_user_id\n  FOR UPDATE;");
    const activeCount = sql.indexOf("INTO v_active_jobs");
    const insertGeneration = sql.indexOf("INSERT INTO public.generations");
    expect(tenantLock).toBeGreaterThan(-1);
    expect(activeCount).toBeGreaterThan(tenantLock);
    expect(insertGeneration).toBeGreaterThan(activeCount);
    expect(sql.indexOf("RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'")).toBeLessThan(
      activeCount,
    );
    expect(insertGeneration).toBeLessThan(sql.indexOf("UPDATE public.profiles AS p"));
    expect(sql.indexOf("UPDATE public.profiles AS p")).toBeLessThan(
      sql.indexOf("INSERT INTO public.credit_logs"),
    );
    expect(sql).not.toContain("INSERT INTO private.generation_job_outbox");
    expect(migration).toContain("CREATE TRIGGER generations_insert_bullmq_outbox");
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.create_generation_with_credit_debit(",
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Users can insert own generations" ON public.generations;',
    );
    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS generations_user_active_admission_idx",
    );
    expect(migration).toContain(
      "WHERE status = 'queued' OR status LIKE 'processing_%';",
    );
  });

  it("transactionally covers trusted queued inserts without enqueueing batch parents", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.prepare_generation_bullmq_delivery()",
    );
    expect(migration).toContain("IF NEW.status <> 'queued' THEN");
    expect(migration).toContain(
      "NEW.delivery_version := GREATEST(COALESCE(NEW.delivery_version, 0), 1);",
    );
    expect(migration).toContain("'internal-generation-' || NEW.id::TEXT");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.insert_generation_bullmq_outbox()",
    );
    expect(migration).toContain("AFTER INSERT ON public.generations");
    expect(productRetouchSchema).toContain("'processing_batch'");
    expect(productRetouchSchema.match(/'queued'/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(productRetouchSchema).toContain("'internalTask', true");
  });

  it("fairly interleaves tenants before taking SKIP LOCKED publisher leases", () => {
    const sql = functionSql("claim_generation_outbox", "confirm_generation_outbox");
    expect(sql).toContain("p_limit INTEGER DEFAULT 50");
    expect(sql).toContain("p_lease_seconds INTEGER DEFAULT 60");
    expect(sql).toContain("outbox_id UUID");
    expect(sql).toContain("delivery_version INTEGER");
    expect(sql).toContain("delivery_key TEXT");
    expect(sql).toContain("available_at TIMESTAMPTZ");
    expect(sql).toContain("lease_token UUID");
    expect(sql).toContain("attempts INTEGER");
    expect(sql).toContain("v_candidate_limit := LEAST(p_limit * 16, 8000)");
    expect(sql).toContain("WITH pending_sample AS MATERIALIZED");
    expect(sql).toContain("expired_lease_sample AS MATERIALIZED");
    expect(sql).toContain("bounded_ready AS MATERIALIZED");
    expect(sql).toContain("LIMIT v_candidate_limit");
    expect(sql).toContain("tenant_ranked AS MATERIALIZED");
    expect(sql).toContain("row_number() OVER (");
    expect(sql).toContain("PARTITION BY ready.user_id");
    expect(sql).toContain(
      "ORDER BY ready.ready_at, ready.created_at, ready.id",
    );
    expect(sql).toContain("JOIN private.generation_job_outbox AS o");
    expect(sql).toContain(
      "ORDER BY ranked.tenant_rank, ranked.ready_at, ranked.created_at, ranked.id",
    );
    expect(sql).toContain("FOR UPDATE OF o SKIP LOCKED");
    expect(sql.indexOf("row_number() OVER (")).toBeLessThan(
      sql.indexOf("FOR UPDATE OF o SKIP LOCKED"),
    );
    expect(sql).not.toContain("WITH ready AS MATERIALIZED");
    expect(sql).not.toMatch(/FROM private\.generation_job_outbox AS o\n\s+WHERE o\.attempts < o\.max_attempts\n\s+AND \(/);
    expect(sql).toContain("lease_token = gen_random_uuid()");
    expect(sql).toContain("o.status = 'publishing'");
    expect(sql).toContain("o.lease_expires_at <= v_now");
    expect(migration).toContain(
      "WHERE status = 'pending' AND attempts < max_attempts;",
    );
    expect(migration).toContain(
      "WHERE status = 'publishing' AND attempts < max_attempts;",
    );
    expect(migration).toContain("INCLUDE (user_id, available_at)");
    expect(claimBenchmark).toContain("\\set rows 1000000");
    expect(claimBenchmark).toContain("CREATE TEMP TABLE");
    expect(claimBenchmark).toContain("EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)");
    expect(claimBenchmark).toContain("LIMIT 8000");
    expect(claimBenchmark).toContain("row_number() OVER (");
  });

  it("fences publish confirmation and negative acknowledgement by lease token", () => {
    const confirmSql = functionSql(
      "confirm_generation_outbox",
      "nack_generation_outbox",
    );
    const nackSql = functionSql(
      "nack_generation_outbox",
      "recover_generation_outbox",
    );
    expect(confirmSql).toContain("AND o.lease_token = p_lease_token");
    expect(confirmSql).toContain("AND p_bullmq_job_id = o.delivery_key");
    expect(nackSql).toContain("AND o.lease_token = p_lease_token");
    expect(nackSql).toContain(
      "CASE WHEN o.attempts >= o.max_attempts THEN 'dead' ELSE 'pending' END",
    );
  });

  it("recovers expired publisher leases and repairs only current-version invariant drift", () => {
    const sql = functionSql("recover_generation_outbox", "get_generation_queue_health");
    expect(sql).toContain("o.lease_expires_at <= v_now");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).not.toContain("g.delivery_version = g.delivery_version");
    expect(sql).toContain("o.delivery_version = g.delivery_version");
    expect(sql).toContain("ON CONFLICT (generation_id, delivery_version) DO NOTHING");
    expect(sql).toContain("Historical rows were\n  -- deliberately deleted");
    expect(sql).toContain("redriven_published INTEGER");
    expect(sql).toContain("cleaned_retention INTEGER");
    expect(sql).toContain("o.published_at <= v_now - interval '120 seconds'");
    expect(sql).toContain("g.status = 'queued'");
    expect(sql).toContain("g.delivery_version = o.delivery_version");
    expect(sql).toContain("attempts = 0");
    expect(sql).toContain("bullmq_job_id = NULL");
    expect(sql).toContain("published_at = NULL");
    expect(sql).toContain("g.status IN ('completed', 'failed')");
    expect(sql).toContain("o.published_at <= v_now - interval '7 days'");
    expect(sql).toContain("o.updated_at <= v_now - interval '30 days'");
  });

  it("fenced-recovers expired executions or atomically fails and refunds after an independent ceiling", () => {
    const sql = functionSql("recover_generation_outbox", "get_generation_queue_health");
    expect(sql).toContain("p_max_execution_attempts INTEGER DEFAULT 10");
    expect(sql).toContain("p_max_execution_attempts NOT BETWEEN 1 AND 100");
    for (const field of [
      "recovered_executions INTEGER",
      "failed_executions INTEGER",
      "refunded_credits BIGINT",
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("g.status = 'processing_tryon'");
    expect(sql).toContain("g.execution_lease_expires_at <= v_now");
    expect(sql).toContain("FOR UPDATE OF g SKIP LOCKED");
    expect(sql).toContain(
      "COALESCE(v_generation.job_attempts, 0) < p_max_execution_attempts",
    );
    expect(sql).toContain(
      "v_next_delivery_version := v_generation.delivery_version + 1",
    );
    expect(sql).toContain("delivery_version = v_next_delivery_version");
    expect(sql).toContain("execution_token = NULL");
    expect(sql).toContain("execution_lease_expires_at = NULL");
    expect(sql).toContain("INSERT INTO private.generation_job_outbox");
    expect(sql).toContain(
      "ON CONFLICT (generation_id, delivery_version) DO NOTHING",
    );

    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain("credits_used = 0");
    expect(sql).toContain("SET credits = p.credits + v_refund_amount");
    expect(sql).toContain("INSERT INTO public.credit_logs");
    expect(sql).toContain("'生成执行重试耗尽退款'");
    expect(sql).toContain("ON CONFLICT (generation_id, delivery_version) DO UPDATE");
    expect(sql).toContain("SET status = 'dead'");
    expect(sql).toContain("status/version/token fence and refund again");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.recover_generation_outbox(INTEGER, INTEGER) TO service_role;",
    );
  });

  it("returns the queue health fields consumed by the relay", () => {
    const sql = functionSql("get_generation_queue_health", "claim_generation_job");
    for (const field of [
      "pending_count",
      "publishing_count",
      "published_count",
      "dead_count",
      "oldest_pending_age_seconds",
    ]) {
      expect(sql).toContain(field);
    }
  });

  it("provides an audited, idempotent service-only redrive for the current queued DLQ delivery", () => {
    expect(migration).toContain(
      "CREATE TABLE private.generation_outbox_redrive_audit",
    );
    expect(migration).toContain(
      "ALTER TABLE private.generation_outbox_redrive_audit FORCE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "REVOKE ALL ON private.generation_outbox_redrive_audit\n  FROM PUBLIC, anon, authenticated, service_role;",
    );

    const sql = functionSql("redrive_generation_outbox", "claim_generation_job");
    expect(sql).toContain("p_outbox_id UUID");
    expect(sql).toContain("p_redrive_id UUID");
    expect(sql).toContain("p_reason TEXT");
    expect(sql).toContain("GENERATION_OUTBOX_SERVICE_ROLE_REQUIRED");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("audit.redrive_id = p_redrive_id");
    expect(sql).toContain("GENERATION_OUTBOX_REDRIVE_IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("replayed BOOLEAN");
    expect(sql).toContain("o.id = p_outbox_id");
    expect(sql).toContain("o.status = 'dead'");
    expect(sql).toContain("g.status = 'queued'");
    expect(sql).toContain("g.delivery_version = o.delivery_version");
    expect(sql).toContain("FOR UPDATE OF o, g");
    expect(sql).toContain("SET status = 'pending'");
    expect(sql).toContain("attempts = 0");
    expect(sql).toContain("available_at = v_now");
    expect(sql).toContain("INSERT INTO private.generation_outbox_redrive_audit");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.redrive_generation_outbox(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.redrive_generation_outbox(UUID, UUID, TEXT) TO service_role;",
    );
  });

  it("fences Bull workers by delivery version and execution token", () => {
    const claimSql = functionSql("claim_generation_job", "heartbeat_generation_job");
    expect(claimSql).toContain("g.delivery_version = p_delivery_version");
    expect(claimSql).toContain("execution_token = p_execution_token");
    expect(claimSql).toContain("p_lease_seconds INTEGER DEFAULT 45");
    expect(claimSql).toContain("p_lease_seconds NOT BETWEEN 15 AND 300");
    expect(claimSql).not.toMatch(/job_attempts[^\n]*<\s*\d+/);

    const heartbeatSql = functionSql(
      "heartbeat_generation_job",
      "defer_generation_for_ai_capacity",
    );
    expect(heartbeatSql).toContain("p_lease_seconds INTEGER DEFAULT 45");
    expect(heartbeatSql).toContain("p_lease_seconds NOT BETWEEN 15 AND 300");

    for (const [name, next] of [
      ["heartbeat_generation_job", "defer_generation_for_ai_capacity"],
      ["defer_generation_for_ai_capacity", "fail_generation_with_credit_refund"],
      ["fail_generation_with_credit_refund", "complete_generation_with_credit_adjustment"],
    ] as const) {
      const sql = functionSql(name, next);
      expect(sql).toContain("p_delivery_version");
      expect(sql).toContain("p_execution_token");
      expect(sql).toContain("g.delivery_version = p_delivery_version");
      expect(sql).toContain("g.execution_token = p_execution_token");
    }
  });

  it("raises an explicit stale-fence error from terminal settlement RPCs", () => {
    const failSql = functionSql(
      "fail_generation_with_credit_refund",
      "complete_generation_with_credit_adjustment",
    );
    const completeSql = functionSql(
      "complete_generation_with_credit_adjustment",
    );
    for (const sql of [failSql, completeSql]) {
      expect(sql).toContain("RAISE EXCEPTION 'STALE_EXECUTION_FENCE'");
      expect(sql).toContain("USING ERRCODE = '40001'");
    }
  });

  it("capacity defer atomically creates the next deterministic delivery without spending an attempt", () => {
    const sql = functionSql(
      "defer_generation_for_ai_capacity",
      "fail_generation_with_credit_refund",
    );
    expect(sql).toContain("delivery_version = g.delivery_version + 1");
    expect(sql).toContain("job_attempts = GREATEST(COALESCE(g.job_attempts, 0) - 1, 0)");
    expect(sql).toContain("INSERT INTO private.generation_job_outbox");
    expect(sql).toContain(
      "'generation-' || v_generation.id::TEXT || '-v' || v_generation.delivery_version::TEXT",
    );
    expect(sql.indexOf("UPDATE public.generations AS g")).toBeLessThan(
      sql.indexOf("INSERT INTO private.generation_job_outbox"),
    );
  });

  it("hardens every privileged RPC with an empty search path", () => {
    const definitions = migration.match(
      /CREATE OR REPLACE FUNCTION public\.[\s\S]*?\$\$;/g,
    ) ?? [];
    expect(definitions.length).toBeGreaterThanOrEqual(10);
    for (const definition of definitions) {
      expect(definition).toContain("SECURITY DEFINER");
      expect(definition).toContain("SET search_path = ''");
    }
    for (const name of [
      "prepare_generation_bullmq_delivery",
      "insert_generation_bullmq_outbox",
    ]) {
      const start = migration.indexOf(`CREATE OR REPLACE FUNCTION private.${name}()`);
      const end = migration.indexOf("$$;", start);
      const sql = migration.slice(start, end);
      expect(start).toBeGreaterThan(-1);
      expect(sql).toContain("SECURITY DEFINER");
      expect(sql).toContain("SET search_path = ''");
    }
  });
});
