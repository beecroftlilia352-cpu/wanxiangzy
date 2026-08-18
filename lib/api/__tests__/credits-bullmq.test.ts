import { beforeEach, describe, expect, it, vi } from "vitest";

const syncGenerationTaskQueueByIdMock = vi.hoisted(() => vi.fn());
const resolveMediaInputMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/task-queue-store", () => ({
  syncGenerationTaskQueueById: syncGenerationTaskQueueByIdMock,
}));
vi.mock("@/lib/api/image-inputs.server", () => ({
  resolveMediaInput: resolveMediaInputMock,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

import { createDebitedGeneration, CreditError } from "@/lib/api/credits";

function params() {
  return {
    userId: "20000000-0000-4000-8000-000000000002",
    clothingUrls: ["https://example.com/source.png"],
    creditsCost: 3,
    aiModel: "nano-banana-2",
    imageSize: "2K",
    reason: "test generation",
    jobPayload: { kind: "generalImage", prompt: "test" },
    idempotencyKey: "task-10000000-0000-4000-8000-000000000001",
  };
}

describe("BullMQ generation credit transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GENERATION_MAX_ACTIVE_PER_USER;
    syncGenerationTaskQueueByIdMock.mockResolvedValue(undefined);
    resolveMediaInputMock.mockResolvedValue("https://assets.example.com/resolved.png");
  });

  it("passes a stable idempotency key and tenant admission limit to the v2 RPC", async () => {
    process.env.GENERATION_MAX_ACTIVE_PER_USER = "50";
    const rpc = vi.fn().mockResolvedValue({
      data: [{ generation_id: "30000000-0000-4000-8000-000000000003", credits_remaining: 97 }],
      error: null,
    });

    await expect(createDebitedGeneration({ rpc }, params())).resolves.toEqual({
      generationId: "30000000-0000-4000-8000-000000000003",
      creditsRemaining: 97,
    });
    expect(rpc).toHaveBeenCalledWith("create_generation_with_credit_debit_v2", expect.objectContaining({
      p_idempotency_key: params().idempotencyKey,
      p_max_active_jobs: 50,
      p_job_payload: params().jobPayload,
    }));
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", 409],
    ["ACTIVE_JOB_LIMIT_EXCEEDED:20:20", 429],
  ])("maps %s to an actionable HTTP status", async (message, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });

    await expect(createDebitedGeneration({ rpc }, params())).rejects.toMatchObject({
      name: "CreditError",
      status,
    } satisfies Partial<CreditError>);
  });

  it("rejects malformed idempotency keys before writing the database", async () => {
    const rpc = vi.fn();

    await expect(createDebitedGeneration({ rpc }, { ...params(), idempotencyKey: "short" }))
      .rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preflights tenant media before the debit RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ generation_id: "30000000-0000-4000-8000-000000000003", credits_remaining: 97 }],
      error: null,
    });

    await createDebitedGeneration({ rpc }, {
      ...params(),
      publicBaseUrl: "https://app.example.com",
      mediaInputs: [
        { url: "/api/media-assets/40000000-0000-4000-8000-000000000004", kind: "image" },
        { url: "/api/media-assets/40000000-0000-4000-8000-000000000005", kind: "image" },
      ],
    });

    expect(resolveMediaInputMock).toHaveBeenCalledTimes(2);
    expect(resolveMediaInputMock).toHaveBeenCalledWith(
      "/api/media-assets/40000000-0000-4000-8000-000000000004",
      expect.objectContaining({ ownerUserId: params().userId, expectedKind: "image" }),
    );
    expect(rpc).toHaveBeenCalledWith("create_generation_with_credit_debit_v2", expect.anything());
  });

  it("does not debit when media preflight rejects an input", async () => {
    resolveMediaInputMock.mockRejectedValueOnce(new Error("cross-tenant media"));
    const rpc = vi.fn();

    await expect(createDebitedGeneration({ rpc }, {
      ...params(),
      mediaInputs: [{ url: "/api/media-assets/40000000-0000-4000-8000-000000000004", kind: "image" }],
    })).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
