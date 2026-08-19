import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260818093405_commercial_media_asset_registry.sql",
  ),
  "utf8",
);

function tableSql(name: string, nextMarker: string) {
  const start = migration.indexOf(`CREATE TABLE ${name}`);
  const end = migration.indexOf(nextMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

function functionSql(schema: "public" | "private", name: string) {
  const start = migration.indexOf(
    `CREATE OR REPLACE FUNCTION ${schema}.${name}(`,
  );
  const end = migration.indexOf("\n$$;", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("commercial OSS media asset SQL contract", () => {
  it("keeps the canonical inventory private and never persists OSS credentials or signed URLs", () => {
    const table = tableSql(
      "private.media_assets",
      "CREATE INDEX media_assets_owner_created_idx",
    );
    for (const field of [
      "owner_user_id UUID NOT NULL",
      "purpose TEXT NOT NULL",
      "visibility TEXT NOT NULL",
      "storage_class TEXT NOT NULL",
      "bucket_name TEXT NOT NULL",
      "object_key TEXT NOT NULL UNIQUE",
      "sha256 TEXT",
      "size_bytes BIGINT",
      "mime_type TEXT",
      "width INTEGER",
      "height INTEGER",
      "idempotency_key TEXT NOT NULL",
      "request_fingerprint JSONB NOT NULL",
      "fence_version BIGINT NOT NULL",
      "retention_until TIMESTAMPTZ",
      "legal_hold BOOLEAN NOT NULL",
    ]) {
      expect(table).toContain(field);
    }
    expect(table).not.toMatch(/access_key|access_secret|signed_url|source_url_ciphertext/i);
    expect(migration).toContain(
      "ALTER TABLE private.media_assets FORCE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "REVOKE ALL ON private.media_assets FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain(
      "GRANT SELECT ON private.media_assets TO authenticated",
    );
  });

  it("uses the requested lifecycle and validates immutable object metadata", () => {
    const table = tableSql(
      "private.media_assets",
      "CREATE INDEX media_assets_owner_created_idx",
    );
    expect(table).toContain(
      "CHECK (status IN ('pending', 'uploaded', 'verified', 'quarantined', 'deleted'))",
    );
    expect(table).toContain("expected_sha256 ~ '^[0-9a-f]{64}$'");
    expect(table).toContain("sha256 ~ '^[0-9a-f]{64}$'");
    expect(table).toContain("media_assets_expected_dimensions_pair_chk");
    expect(table).toContain("media_assets_dimensions_pair_chk");
    expect(table).toContain("object_key !~");
    expect(table).toContain("octet_length(object_key) BETWEEN 1 AND 1023");
    expect(table).toContain("position(chr(92) IN object_key) = 0");
  });

  it("exposes only a read-only RLS projection through the Data API", () => {
    const projection = tableSql(
      "public.media_asset_records",
      "CREATE INDEX media_asset_records_owner_created_idx",
    );
    expect(projection).not.toMatch(
      /bucket_name|object_key|sha256|lease_token|lease_expires_at|last_error|idempotency_key/,
    );
    expect(migration).toContain(
      "ALTER TABLE public.media_asset_records FORCE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "GRANT SELECT ON public.media_asset_records TO authenticated, service_role;",
    );
    expect(migration).not.toContain(
      "GRANT SELECT ON public.media_asset_records TO anon",
    );
    expect(migration).not.toMatch(
      /GRANT (?:INSERT|UPDATE|DELETE).*public\.media_asset_records/,
    );
    expect(migration).toContain("media_asset_records_read_own");
    expect(migration).not.toContain("media_asset_records_read_public_verified");
    const resolve = functionSql("public", "resolve_media_asset_object");
    expect(resolve).toContain("asset.visibility = 'public'");
    expect(resolve).toContain("asset.status = 'verified'");
  });

  it("creates service-only owner-scoped uploads idempotently and rotates only expired leases", () => {
    const sql = functionSql("public", "create_media_asset_upload");
    expect(sql).toContain("p_lease_seconds INTEGER DEFAULT 900");
    expect(sql).toContain("p_bucket_name TEXT DEFAULT 'primary'");
    expect(sql).toContain("p_lease_seconds < 60 OR p_lease_seconds > 3600");
    expect(sql).toContain("MEDIA_ASSET_SERVICE_ROLE_REQUIRED");
    expect(sql).toContain("INVALID_MEDIA_ASSET_BUCKET_NAME");
    expect(sql).toContain("'bucketName', v_bucket_name");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("request_fingerprint <> v_fingerprint");
    expect(sql).toContain("v_purpose = 'generation_result' THEN 'generated_30d'");
    expect(sql).toContain("ELSE 'unreferenced_7d'");
    expect(sql).toContain("'retentionPolicy', v_retention_policy");
    expect(sql).toContain("v_retention_until");
    expect(sql).toContain("MEDIA_ASSET_IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("v_asset.lease_expires_at <= clock_timestamp()");
    expect(sql).toContain("fence_version = asset.fence_version + 1");
    expect(sql).toContain("lease_token = gen_random_uuid()");
    expect(sql).not.toMatch(/signed|access[_ ]?key/i);
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_media_asset_upload\([\s\S]+?\)\s+TO service_role;/,
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_media_asset_upload\([\s\S]+?\)\s+TO authenticated/,
    );
  });

  it("fences upload completion, quarantines mismatches, and makes settlement replay-safe", () => {
    const complete = functionSql("public", "complete_media_asset_upload");
    expect(complete).toContain("STALE_MEDIA_ASSET_UPLOAD_FENCE");
    expect(complete).toContain("v_asset.lease_token IS DISTINCT FROM p_lease_token");
    expect(complete).toContain("v_asset.fence_version <> p_fence_version");
    expect(complete).toContain("v_asset.lease_expires_at <= clock_timestamp()");
    expect(complete).toContain("v_asset.expected_sha256 = v_sha256");
    expect(complete).toContain(
      "status = CASE WHEN v_matches THEN 'uploaded' ELSE 'quarantined' END",
    );
    expect(complete).toContain("MEDIA_ASSET_COMPLETION_IDEMPOTENCY_CONFLICT");
    expect(complete).toContain("upload_settlement_token = p_lease_token");

    const verify = functionSql("public", "verify_media_asset");
    expect(verify).toContain("STALE_MEDIA_ASSET_VERIFY_FENCE");
    expect(verify).toContain("checksum_verified_at = clock_timestamp()");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.verify_media_asset(UUID, BIGINT) TO service_role;",
    );
  });

  it("durably enqueues uploaded videos in the same asset-completion transaction", () => {
    const queue = tableSql(
      "private.media_validation_jobs",
      "CREATE INDEX media_validation_jobs_pending_claim_idx",
    );
    expect(queue).toContain("media_asset_id UUID NOT NULL UNIQUE");
    expect(queue).toContain(
      "CHECK (status IN ('pending', 'processing', 'completed', 'dead'))",
    );
    expect(queue).toContain("asset_fence_version BIGINT NOT NULL");
    expect(queue).toContain("lease_version BIGINT NOT NULL DEFAULT 0");
    expect(queue).toContain("max_attempts INTEGER NOT NULL DEFAULT 12");
    expect(migration).toContain(
      "ALTER TABLE private.media_validation_jobs FORCE ROW LEVEL SECURITY;",
    );
    expect(migration).toContain(
      "REVOKE ALL ON private.media_validation_jobs FROM PUBLIC, anon, authenticated, service_role;",
    );
    const enqueue = functionSql("private", "enqueue_media_validation_job");
    expect(enqueue).toContain("NEW.status = 'uploaded'");
    expect(enqueue).toContain("NEW.mime_type LIKE 'video/%'");
    expect(enqueue).toContain("NEW.fence_version");
    expect(enqueue).toContain("ON CONFLICT (media_asset_id) DO NOTHING");
    expect(migration).toContain("CREATE TRIGGER media_assets_enqueue_video_validation");
    expect(functionSql("public", "verify_media_asset")).toContain(
      "MEDIA_VALIDATION_JOB_REQUIRED",
    );
  });

  it("claims and heartbeats media validation with SKIP LOCKED and a versioned lease", () => {
    const claim = functionSql("public", "claim_media_validation_jobs");
    expect(claim).toContain("p_limit INTEGER DEFAULT 20");
    expect(claim).toContain("p_lease_seconds INTEGER DEFAULT 120");
    expect(claim).toContain("p_worker_id TEXT DEFAULT 'media-validator'");
    expect(claim).toContain("bucket_name TEXT");
    expect(claim).toContain("asset.bucket_name");
    expect(claim).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(claim).toContain("asset.status = 'uploaded'");
    expect(claim).toContain("asset.fence_version = job.asset_fence_version");
    expect(claim).toContain("lease_token = gen_random_uuid()");
    expect(claim).toContain("lease_version = job.lease_version + 1");
    expect(claim).toContain("attempts = job.attempts + 1");

    const heartbeat = functionSql("public", "heartbeat_media_validation_job");
    expect(heartbeat).toContain("job.lease_token = p_lease_token");
    expect(heartbeat).toContain("job.lease_version = p_lease_version");
    expect(heartbeat).toContain("job.lease_expires_at > clock_timestamp()");
    expect(heartbeat).toContain("STALE_MEDIA_VALIDATION_FENCE");
  });

  it("atomically verifies or quarantines validation results and recovers orphaned work", () => {
    const complete = functionSql("public", "complete_media_validation_job");
    expect(complete).toContain("v_asset.sha256 = v_sha256");
    expect(complete).toContain("v_asset.size_bytes = p_observed_size_bytes");
    expect(complete).toContain("v_asset.mime_type = v_mime_type");
    expect(complete).toContain(
      "status = CASE WHEN v_matches THEN 'verified' ELSE 'quarantined' END",
    );
    expect(complete).toContain("duration_ms = p_duration_ms");
    expect(complete).toContain("STALE_MEDIA_ASSET_VALIDATION_FENCE");
    expect(complete).toContain("MEDIA_VALIDATION_COMPLETION_IDEMPOTENCY_CONFLICT");

    const defer = functionSql("public", "defer_media_validation_job");
    expect(defer).toContain("v_job.attempts < v_job.max_attempts");
    expect(defer).toContain("ELSE 'dead'");
    expect(defer).toContain("STALE_MEDIA_VALIDATION_FENCE");
    expect(defer).toContain("IF v_status = 'dead' THEN");
    expect(defer).toContain("UPDATE private.media_assets AS asset");
    expect(defer).toContain("SET status = 'quarantined'");
    expect(defer).toContain("asset.status = 'uploaded'");
    expect(defer).toContain("asset.fence_version = v_job.asset_fence_version");

    const recover = functionSql("public", "recover_media_validation_jobs");
    expect(recover).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(recover).toContain("recovery: validation lease expired");
    expect(recover).toContain("recovery: maximum attempts exhausted");
    expect(recover).toContain("dead_jobs AS (");
    expect(recover).toContain("quarantined AS (");
    expect(recover).toContain("SET status = 'quarantined'");
    expect(recover).toContain("asset.status = 'uploaded'");
    expect(recover).toContain("asset.fence_version = dead_jobs.asset_fence_version");
    expect(recover).toContain("ON CONFLICT (media_asset_id) DO NOTHING");
    expect(recover).toContain("repaired_missing");

    const health = functionSql("public", "get_media_validation_queue_health");
    for (const field of [
      "pending_count",
      "processing_count",
      "completed_count",
      "dead_count",
      "stale_processing_count",
      "uploaded_without_job_count",
      "oldest_pending_age_seconds",
    ]) {
      expect(health).toContain(field);
    }
  });

  it("claims retention cleanup concurrently without deleting referenced or held assets", () => {
    const claim = functionSql("public", "claim_media_asset_cleanup");
    expect(claim).toContain("bucket_name TEXT");
    expect(claim).toContain("claimed.bucket_name");
    expect(claim).toContain("p_limit INTEGER DEFAULT 50");
    expect(claim).toContain("p_lease_seconds INTEGER DEFAULT 300");
    expect(claim).toContain("FOR UPDATE SKIP LOCKED");
    expect(claim).toContain("asset.retention_until <= clock_timestamp()");
    expect(claim).toContain("asset.legal_hold = false");
    expect(claim).toContain(
      "NOT private.media_asset_has_active_reference(asset.id)",
    );
    expect(claim).toContain("lease_kind = 'cleanup'");
    expect(claim).toContain("fence_version = asset.fence_version + 1");
    expect(claim).toContain(
      "cleanup_authorized_at = asset.cleanup_authorized_at",
    );
    expect(claim).not.toMatch(/cleanup_attempts\s*</);

    const authorize = functionSql("public", "authorize_media_asset_cleanup");
    expect(authorize).toContain("STALE_MEDIA_ASSET_CLEANUP_FENCE");
    expect(authorize).toContain(
      "private.media_asset_has_active_reference(v_asset.id)",
    );
    expect(authorize).toContain("cleanup_authorized_at = clock_timestamp()");
    expect(authorize).toContain("irreversible delete linearization point");

    const confirm = functionSql("public", "confirm_media_asset_cleanup");
    expect(confirm).toContain("STALE_MEDIA_ASSET_CLEANUP_FENCE");
    expect(confirm).toContain("private.media_asset_has_active_reference(v_asset.id)");
    expect(confirm).toContain("status = 'deleted'");
    expect(confirm).toContain("cleanup_settlement_kind = 'confirm'");
    expect(confirm).toContain("v_asset.cleanup_authorized_at IS NULL");

    const nack = functionSql("public", "nack_media_asset_cleanup");
    expect(nack).toContain("asset.cleanup_authorized_at IS NULL THEN NULL");
    expect(nack).toContain("ELSE 'cleanup'");
    expect(nack).toContain(
      "cleanup_authorized_at = asset.cleanup_authorized_at",
    );
    expect(nack).toContain("force an idempotent retry");
  });

  it("revokes a cleanup fence when legal hold is enabled", () => {
    const sql = functionSql("public", "set_media_asset_legal_hold");
    expect(sql).toContain("LEGAL_HOLD_REASON_REQUIRED");
    expect(sql).toContain("MEDIA_ASSET_DELETE_ALREADY_AUTHORIZED");
    expect(sql.indexOf("MEDIA_ASSET_DELETE_ALREADY_AUTHORIZED")).toBeLessThan(
      sql.indexOf("UPDATE private.media_assets AS asset"),
    );
    expect(sql).toContain(
      "p_legal_hold AND asset.lease_kind = 'cleanup' THEN NULL",
    );
    expect(sql).toContain("asset.fence_version + 1");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_media_asset_legal_hold(UUID, BOOLEAN, TEXT) TO service_role;",
    );
  });

  it("supports generic references and conditionally links resource-library assets", () => {
    expect(migration).toContain("CREATE TABLE private.media_asset_links");
    expect(migration).toContain("media_asset_links_subject_slot_uidx");
    expect(migration).toContain("public.attach_media_asset_reference");
    const detachGeneration = functionSql("private", "detach_generation_media_asset_links");
    expect(detachGeneration).toContain("DELETE FROM private.media_asset_links AS link");
    expect(detachGeneration).toContain("link.subject_type = 'generation'");
    expect(detachGeneration).toContain("link.subject_id = OLD.id");
    expect(migration).toContain("CREATE TRIGGER generations_detach_media_asset_links");
    expect(migration).toContain("AFTER DELETE ON public.generations");
    const attach = functionSql("public", "attach_media_asset_reference");
    expect(attach).toContain("FOR UPDATE");
    expect(attach).toContain("v_asset.lease_kind = 'cleanup'");
    expect(migration).toContain(
      "IF to_regclass('public.resource_library_assets') IS NOT NULL THEN",
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS media_asset_id UUID");
    expect(migration).toMatch(
      /REFERENCES private\.media_assets\(id\)\s+ON DELETE RESTRICT/,
    );
    expect(migration).toContain(
      "CREATE TRIGGER resource_library_assets_validate_media_asset",
    );
    expect(migration).toContain(
      "CREATE TRIGGER oss_mirror_transfers_validate_media_asset",
    );
    expect(migration).toContain("oss_mirror_transfers_media_asset_id_fkey");
    expect(migration).toContain("asset.owner_user_id = NEW.owner_user_id");
    expect(migration).toContain("asset.object_key = NEW.object_key");
  });

  it("resolves verified worker objects only with an explicit owner fence", () => {
    const resolver = functionSql(
      "public",
      "resolve_verified_media_asset_for_worker",
    );
    expect(resolver).toContain("p_expected_owner_user_id UUID");
    for (const field of [
      "bucket_name TEXT",
      "object_key TEXT",
      "mime_type TEXT",
      "size_bytes BIGINT",
      "sha256 TEXT",
      "purpose TEXT",
    ]) {
      expect(resolver).toContain(field);
    }
    expect(resolver).toContain("asset.owner_user_id = p_expected_owner_user_id");
    expect(resolver).toContain("asset.status = 'verified'");
    expect(resolver).toContain("MEDIA_ASSET_SERVICE_ROLE_REQUIRED");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.resolve_verified_media_asset_for_worker(UUID, UUID)\n  FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.resolve_verified_media_asset_for_worker(UUID, UUID) TO service_role;",
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_verified_media_asset_for_worker\([^;]+\) TO (?:PUBLIC|anon|authenticated)/,
    );

    const status = functionSql("public", "get_media_asset_status");
    expect(status).toContain("asset.owner_user_id = p_expected_owner_user_id");
    expect(status).toContain("fence_version BIGINT");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_media_asset_status(UUID, UUID) TO service_role;",
    );
  });

  it("hardens every definer RPC with an empty search path and explicit grants", () => {
    const definerCount = migration.match(/\nSECURITY DEFINER/g)?.length ?? 0;
    const emptySearchPathCount =
      migration.match(/SET search_path = ''/g)?.length ?? 0;
    expect(definerCount).toBeGreaterThanOrEqual(13);
    expect(emptySearchPathCount).toBe(definerCount);
    for (const rpc of [
      "claim_media_asset_cleanup",
      "authorize_media_asset_cleanup",
      "confirm_media_asset_cleanup",
      "nack_media_asset_cleanup",
      "set_media_asset_legal_hold",
      "attach_media_asset_reference",
      "detach_media_asset_reference",
      "get_media_asset_lifecycle_health",
      "claim_media_validation_jobs",
      "heartbeat_media_validation_job",
      "complete_media_validation_job",
      "defer_media_validation_job",
      "recover_media_validation_jobs",
      "get_media_validation_queue_health",
      "get_media_asset_status",
      "resolve_verified_media_asset_for_worker",
      "get_runtime_contract_version",
    ]) {
      expect(migration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^;]+service_role;`),
      );
    }
  });

  it("exposes an exact service-only runtime contract version and hash", () => {
    const sql = functionSql("public", "get_runtime_contract_version");
    expect(sql).toContain("RETURNS TABLE(contract_version TEXT, contract_hash TEXT)");
    expect(sql).toContain("'2026-08-18.6'::TEXT");
    expect(sql).toContain(
      "'1dad0e31ba0f5b808009706a29595186274d92cb48a3f1395bc7028c8f2a3977'::TEXT",
    );
    expect(sql).toContain("RUNTIME_CONTRACT_SERVICE_ROLE_REQUIRED");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_runtime_contract_version()\n  FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_runtime_contract_version() TO service_role;",
    );
  });
});
