import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(import.meta.dirname, "../../supabase/migrations/20260818083000_oss_mirror_transfers.sql"),
  "utf8",
);

function functionSql(name: string, next?: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = next ? sql.indexOf(`CREATE OR REPLACE FUNCTION public.${next}(`, start) : sql.length;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("OSS mirror durable queue SQL", () => {
  it("deterministically rebuilds the clean-slate service-only table", () => {
    expect(sql.indexOf("DROP TABLE IF EXISTS public.oss_mirror_transfers CASCADE;")).toBeLessThan(
      sql.indexOf("CREATE TABLE public.oss_mirror_transfers"),
    );
    expect(sql).toContain("ALTER TABLE public.oss_mirror_transfers FORCE ROW LEVEL SECURITY;");
    expect(sql).toContain("REVOKE ALL ON TABLE public.oss_mirror_transfers FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oss_mirror_transfers TO service_role;");
    expect(sql).toContain("source_url_ciphertext IS NULL AND source_url_sha256 IS NULL");
  });

  it("claims fairly with SKIP LOCKED and a token plus version fence", () => {
    const claim = functionSql("claim_oss_mirror_transfers", "heartbeat_oss_mirror_transfer");
    expect(claim).toContain("FOR UPDATE SKIP LOCKED");
    expect(claim).toContain("lease_token = gen_random_uuid()");
    expect(claim).toContain("lease_version = transfer.lease_version + 1");
    const heartbeat = functionSql("heartbeat_oss_mirror_transfer", "complete_oss_mirror_transfer");
    expect(heartbeat).toContain("transfer.lease_token = p_lease_token");
    expect(heartbeat).toContain("transfer.lease_version = p_lease_version");
  });

  it("publishes only verified SHA256 registry assets under the live fence", () => {
    const complete = functionSql("complete_oss_mirror_transfer", "defer_oss_mirror_transfer");
    expect(complete).toContain("transfer.lease_token IS DISTINCT FROM p_lease_token");
    expect(complete).toContain("transfer.lease_version <> p_lease_version");
    expect(complete).toContain("p_checksum_kind <> 'sha256'");
    expect(complete).toContain("p_media_asset_id IS NULL");
    expect(complete).toContain("media_asset_id = p_media_asset_id");
    expect(sql).toContain("checksum_kind = 'sha256'");
    expect(sql).toContain("media_asset_id IS NOT NULL");
  });

  it("uses bounded retries and clears provider capabilities on DLQ", () => {
    const defer = functionSql("defer_oss_mirror_transfer", "expire_oss_mirror_transfers");
    expect(defer).toContain("v_transfer.attempts >= v_transfer.max_attempts");
    expect(defer).toContain("CASE WHEN v_failed THEN NULL ELSE transfer.source_url_ciphertext END");
    expect(defer).toContain("RAISE EXCEPTION 'STALE_OSS_MIRROR_FENCE'");
  });
});
