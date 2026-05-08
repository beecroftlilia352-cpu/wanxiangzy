import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_RATE_LIMITS, checkRateLimit, enforceApiRateLimit } from "@/lib/api/rate-limit";

const supabaseMock = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: supabaseMock.getAdminClient,
}));

describe("checkRateLimit", () => {
  beforeEach(() => {
    supabaseMock.getAdminClient.mockReturnValue({ rpc: supabaseMock.rpc });
    supabaseMock.rpc.mockReset();
  });

  it("checks the Supabase rate-limit RPC with the provided key and policy", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { allowed: true }, error: null });

    await expect(checkRateLimit("tryon:user-1", 20, 60_000)).resolves.toEqual({ ok: true });

    expect(supabaseMock.rpc).toHaveBeenCalledWith("check_rate_limit", expect.objectContaining({
      p_key: "tryon:user-1",
      p_limit: 20,
      p_window_ms: 60_000,
    }));
  });

  it("returns retry-after seconds from denied RPC responses", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { allowed: false, retry_after_ms: 1250 },
      error: null,
    });

    await expect(checkRateLimit("favorite-mutation:user-1", 60, 60_000)).resolves.toEqual({
      ok: false,
      retryAfterSeconds: 2,
    });
  });
});

describe("enforceApiRateLimit", () => {
  beforeEach(() => {
    supabaseMock.getAdminClient.mockReturnValue({ rpc: supabaseMock.rpc });
    supabaseMock.rpc.mockReset();
  });

  it("returns null when the named policy allows the request", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { allowed: true }, error: null });

    await expect(enforceApiRateLimit("user-1", API_RATE_LIMITS.tryonGenerate)).resolves.toBeNull();
  });

  it("returns a 429 response with Retry-After when the policy is exceeded", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { allowed: false, retry_after_ms: 7000 },
      error: null,
    });

    const response = await enforceApiRateLimit("user-1", API_RATE_LIMITS.apiPlatformTestProxy);

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("7");
  });
});
