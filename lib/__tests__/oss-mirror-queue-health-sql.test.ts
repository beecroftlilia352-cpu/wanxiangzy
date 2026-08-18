import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260818090000_oss_mirror_queue_health.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = migration.indexOf("$$;", start);
  if (start < 0 || end < 0) throw new Error(`function body not found: ${name}`);
  return migration.slice(start, end);
}

describe("OSS mirror outbox health SQL contract", () => {
  it("exposes the expected health columns to the admin UI", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_oss_mirror_queue_health()");
    for (const column of [
      "pending_count",
      "processing_count",
      "completed_count",
      "failed_count",
      "oldest_pending_age_seconds",
      "oldest_processing_age_seconds",
      "stale_processing_count",
      "last_recovered_at",
      "last_completed_at",
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_oss_mirror_queue_health() TO service_role;",
    );
  });

  it("hardens the health RPC with an empty search_path and service-role grants", () => {
    const body = functionBody("get_oss_mirror_queue_health");
    expect(body).toContain("STABLE");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = ''");
  });

  it("recovers stuck OSS mirror rows without disturbing fresh leases", () => {
    const body = functionBody("recover_oss_mirror_transfers");
    expect(body).toContain("FOR UPDATE SKIP LOCKED");
    expect(body).toContain("lease_expires_at <= now()");
    expect(body).toContain("status = 'pending'");
    expect(body).toContain("INVALID_RECOVER_LIMIT");
    expect(body).toContain("INVALID_STALE_LEASE_SECONDS");
    expect(body).toContain("recovery: lease expired before completion");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.recover_oss_mirror_transfers");
  });

  it("durable indexes back the new health and recovery queries", () => {
    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS oss_mirror_transfers_status_next_attempt_idx",
    );
    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS oss_mirror_transfers_pending_age_idx",
    );
  });
});
