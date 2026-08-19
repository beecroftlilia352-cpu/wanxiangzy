import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.hoisted(() => vi.fn());
const writeAdminAuditLogMock = vi.hoisted(() => vi.fn());
const adminRpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/auth", () => ({ requireAdminApi: requireAdminApiMock }));
vi.mock("@/lib/admin/audit", () => ({ writeAdminAuditLog: writeAdminAuditLogMock }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ rpc: adminRpcMock }),
}));

import { POST as recoverOutbox } from "@/app/api/admin/workers/run/route";
import { POST as retiredProcessor } from "@/app/api/jobs/process-generations/route";

describe("worker control routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      context: { actorUserId: "admin", actorEmail: "admin@example.com", actorRole: "admin" },
    });
    writeAdminAuditLogMock.mockResolvedValue(undefined);
  });

  it("retires the legacy HTTP processor without executing generation work", async () => {
    const response = await retiredProcessor();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ ok: false, queueMode: "bullmq" });
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("admin generation trigger only recovers outbox deliveries and reads health", async () => {
    adminRpcMock.mockImplementation(async (name: string) => {
      if (name === "recover_generation_outbox") {
        return { data: [{ recovered_leases: 2, repaired_missing: 1, dead_lettered: 0 }], error: null };
      }
      if (name === "get_generation_queue_health") {
        return { data: [{ pending_count: 3, publishing_count: 0, dead_count: 0 }], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const response = await recoverOutbox(new Request("http://localhost/api/admin/workers/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "generations", limit: 250, reason: "recover queue delivery" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: {
        action: "outbox-recovery",
        executedBusinessJobs: 0,
        recovery: { recovered_leases: 2, repaired_missing: 1 },
        health: { pending_count: 3 },
      },
    });
    expect(adminRpcMock.mock.calls).toEqual([
      ["recover_generation_outbox", { p_limit: 250 }],
      ["get_generation_queue_health"],
    ]);
  });
});
