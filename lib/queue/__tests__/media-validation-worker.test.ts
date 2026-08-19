import { describe, expect, it, vi } from "vitest";

import {
  MediaValidationError,
  parseMediaValidationConfig,
  runMediaValidationBatch,
  type MediaValidationDatabase,
} from "@/lib/queue/media-validation-worker.server";
import { runMediaAssetCleanupBatch } from "@/lib/queue/media-asset-cleanup-worker.server";

const claim = {
  job_id: "job-1",
  asset_id: "asset-1",
  owner_user_id: "owner-1",
  object_key: "generated/video.mp4",
  bucket_name: "private-bucket",
  expected_sha256: "a".repeat(64),
  expected_size_bytes: 10,
  expected_mime_type: "video/mp4",
  asset_fence_version: 2,
  lease_token: "lease-1",
  lease_version: 3,
  attempts: 1,
};

function database(handler: (name: string, args?: Record<string, unknown>) => unknown) {
  return {
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => ({
      data: handler(name, args),
      error: null,
    })),
  } as unknown as MediaValidationDatabase & { rpc: ReturnType<typeof vi.fn> };
}

describe("durable media validation worker", () => {
  it("claims with bounded concurrency and atomically verifies observed media", async () => {
    const db = database((name) => {
      if (name === "claim_media_validation_jobs") return [claim];
      if (name === "complete_media_validation_job") return [{ metadata_matches: true, asset_status: "verified" }];
      throw new Error(`unexpected ${name}`);
    });
    const inspect = vi.fn().mockResolvedValue({
      sha256: "a".repeat(64), sizeBytes: 10, mimeType: "video/mp4",
      width: 1920, height: 1080, durationMs: 2_000, formatName: "mov,mp4",
    });
    const config = parseMediaValidationConfig({ MEDIA_VALIDATION_CONCURRENCY: "4" } as unknown as NodeJS.ProcessEnv);

    await expect(runMediaValidationBatch({ database: db, config, inspect })).resolves.toEqual({
      claimed: 1, verified: 1, quarantined: 0, deferred: 0, dead: 0,
    });
    expect(db.rpc).toHaveBeenCalledWith("claim_media_validation_jobs", expect.objectContaining({ p_limit: 4 }));
    expect(db.rpc).toHaveBeenCalledWith("complete_media_validation_job", expect.objectContaining({
      p_job_id: "job-1", p_lease_token: "lease-1", p_lease_version: 3,
      p_observed_sha256: "a".repeat(64), p_width: 1920, p_height: 1080,
    }));
  });

  it("settles valid-but-mismatched bytes as quarantine instead of retrying", async () => {
    const db = database((name) => {
      if (name === "claim_media_validation_jobs") return [claim];
      if (name === "complete_media_validation_job") return [{ metadata_matches: false, asset_status: "quarantined" }];
      throw new Error(`unexpected ${name}`);
    });
    const inspect = vi.fn().mockResolvedValue({
      sha256: "b".repeat(64), sizeBytes: 11, mimeType: "video/mp4",
      width: 1280, height: 720, durationMs: 1_000, formatName: "mov,mp4",
    });

    const result = await runMediaValidationBatch({ database: db, inspect });
    expect(result.quarantined).toBe(1);
    expect(db.rpc).not.toHaveBeenCalledWith("defer_media_validation_job", expect.anything());
  });

  it("sends deterministic probe failures directly to the durable DLQ", async () => {
    const db = database((name, args) => {
      if (name === "claim_media_validation_jobs") return [claim];
      if (name === "defer_media_validation_job") {
        expect(args?.p_retryable).toBe(false);
        return "dead";
      }
      throw new Error(`unexpected ${name}`);
    });
    const result = await runMediaValidationBatch({
      database: db,
      inspect: async () => { throw new MediaValidationError("unsupported container", false); },
    });
    expect(result.dead).toBe(1);
  });
});

describe("two-phase media cleanup", () => {
  it("authorizes immediately before OSS DELETE and confirms the same fence", async () => {
    const order: string[] = [];
    const db = database((name) => {
      if (name === "claim_media_asset_cleanup") return [{
        asset_id: "asset-1", object_key: "generated/a.mp4", bucket_name: "private-bucket",
        cleanup_token: "cleanup-1", fence_version: 9, cleanup_attempts: 1,
      }];
      order.push(name);
      return true;
    });
    const removeObject = vi.fn(async () => { order.push("oss.delete"); });

    await expect(runMediaAssetCleanupBatch({ database: db, removeObject })).resolves.toEqual({
      claimed: 1, completed: 1, deferred: 0,
    });
    expect(order).toEqual([
      "authorize_media_asset_cleanup",
      "oss.delete",
      "confirm_media_asset_cleanup",
    ]);
  });
});
