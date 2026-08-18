import { beforeEach, describe, expect, it, vi } from "vitest";

const isAliyunOssMirrorEnabledMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/api/oss-mirror-transfer", () => ({
  isAliyunOssMirrorEnabled: isAliyunOssMirrorEnabledMock,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));

import { getOssMirrorHealth } from "@/lib/queue/oss-mirror-health.server";

function rpcOk(data: unknown) {
  return vi.fn().mockResolvedValue({ data, error: null });
}

describe("OSS mirror health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAliyunOssMirrorEnabledMock.mockReturnValue(true);
  });

  it("returns an unconfigured shape when the mirror flag is off", async () => {
    isAliyunOssMirrorEnabledMock.mockReturnValue(false);
    const health = await getOssMirrorHealth({ client: { rpc: rpcOk([]) } });
    expect(health).toMatchObject({
      configured: false,
      reachable: false,
      counts: { pending: 0, processing: 0, completed: 0, failed: 0, staleProcessing: 0 },
      error: null,
    });
  });

  it("normalizes health row counts and ages", async () => {
    const client = {
      rpc: rpcOk([{
        pending_count: 4,
        processing_count: 2,
        completed_count: 19,
        failed_count: 1,
        stale_processing_count: 0,
        oldest_pending_age_seconds: 30,
        oldest_processing_age_seconds: 12,
        last_recovered_at: "2026-08-18T09:00:00Z",
        last_completed_at: "2026-08-18T09:01:00Z",
      }]),
    };
    const health = await getOssMirrorHealth({ client });
    expect(health).toMatchObject({
      configured: true,
      reachable: true,
      counts: { pending: 4, processing: 2, completed: 19, failed: 1, staleProcessing: 0 },
      oldestPendingAgeSeconds: 30,
      oldestProcessingAgeSeconds: 12,
      lastRecoveredAt: "2026-08-18T09:00:00Z",
      lastCompletedAt: "2026-08-18T09:01:00Z",
      error: null,
    });
    expect(health.latencyMs).not.toBeNull();
  });

  it("marks unreachable when the RPC errors out", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } }),
    };
    const health = await getOssMirrorHealth({ client });
    expect(health.reachable).toBe(false);
    expect(health.error).toBe("permission denied");
  });

  it("fails closed on a malformed payload", async () => {
    const client = { rpc: rpcOk(null) };
    const health = await getOssMirrorHealth({ client });
    expect(health.reachable).toBe(false);
    expect(health.error).toMatch(/malformed/i);
  });
});
