import { beforeEach, describe, expect, it, vi } from "vitest";

const processPendingOssMirrorTransfersMock = vi.hoisted(() => vi.fn());
const isAliyunOssRemoteTransferEnabledMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/api/oss-mirror-transfer", () => ({
  isAliyunOssRemoteTransferEnabled: isAliyunOssRemoteTransferEnabledMock,
  processPendingOssMirrorTransfers: processPendingOssMirrorTransfersMock,
}));

import {
  runOssMirrorRecoveryBatch,
  runOssMirrorRecoveryLoop,
} from "@/lib/queue/oss-mirror-recovery.server";

function fakeDb(rows: unknown[] = []) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

describe("OSS mirror recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAliyunOssRemoteTransferEnabledMock.mockReturnValue(true);
    processPendingOssMirrorTransfersMock.mockResolvedValue({
      claimed: 0, completed: 0, deferred: 0, failed: 0,
    });
  });

  it("calls the recover RPC with bounded parameters", async () => {
    const db = fakeDb([{ recovered_id: "x" }]);
    const recovered = await runOssMirrorRecoveryBatch({ database: db, limit: 200, staleLeaseSeconds: 90 });
    expect(recovered).toBe(1);
    expect(db.rpc).toHaveBeenCalledWith("recover_oss_mirror_transfers", {
      p_limit: 200,
      p_stale_lease_seconds: 90,
    });
  });

  it("clamps the limit and stale lease seconds to safe ranges", async () => {
    const db = fakeDb();
    await runOssMirrorRecoveryBatch({ database: db, limit: 999_999, staleLeaseSeconds: 1 });
    expect(db.rpc).toHaveBeenLastCalledWith("recover_oss_mirror_transfers", {
      p_limit: 1000,
      p_stale_lease_seconds: 30,
    });
  });

  it("surfaces RPC errors instead of swallowing them", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    await expect(runOssMirrorRecoveryBatch({ database: db })).rejects.toThrow(/boom/);
  });

  it("runs one cycle and exits when stop is requested after activity", async () => {
    const db = fakeDb([{ recovered_id: "x" }]);
    const onMetric = vi.fn();
    let stopRequested = false;
    processPendingOssMirrorTransfersMock.mockImplementation(async () => {
      stopRequested = true;
      return { claimed: 1, completed: 1, deferred: 0, failed: 0 };
    });
    await runOssMirrorRecoveryLoop({
      database: db,
      config: { batchSize: 10, pollIntervalMs: 1, staleLeaseSeconds: 480 },
      control: { isStopping: () => stopRequested },
      onMetric,
      sleep: vi.fn(),
    });
    expect(processPendingOssMirrorTransfersMock).toHaveBeenCalledWith(10);
    expect(processPendingOssMirrorTransfersMock).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially while claims stay empty", async () => {
    const db = fakeDb();
    const delays: number[] = [];
    await runOssMirrorRecoveryLoop({
      database: db,
      config: { batchSize: 5, pollIntervalMs: 1_000, maxPollIntervalMs: 8_000, staleLeaseSeconds: 480 },
      control: { isStopping: () => delays.length >= 4 },
      sleep: async (ms) => { delays.push(ms); },
    });
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  it("stops immediately when the mirror is disabled", async () => {
    isAliyunOssRemoteTransferEnabledMock.mockReturnValue(false);
    const onMetric = vi.fn();
    await runOssMirrorRecoveryLoop({
      database: fakeDb(),
      config: { batchSize: 5, pollIntervalMs: 1, staleLeaseSeconds: 480 },
      control: { isStopping: () => false },
      onMetric,
    });
    expect(processPendingOssMirrorTransfersMock).not.toHaveBeenCalled();
    expect(onMetric).toHaveBeenCalledWith(expect.objectContaining({ event: "oss_mirror.recovery.disabled" }));
  });
});
