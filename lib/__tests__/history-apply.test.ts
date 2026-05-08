import { afterEach, describe, expect, it, vi } from "vitest";
import { getApplyPath, takeApplyPayload, type HistoryJobPayload } from "@/lib/history-apply";

function mockWindow(href: string) {
  const replaceState = vi.fn();

  vi.stubGlobal("window", {
    location: { href },
    history: {
      state: { from: "test" },
      replaceState,
    },
  });

  return { replaceState };
}

function mockHistoryResponse(payload: HistoryJobPayload, ok = true) {
  const json = vi.fn().mockResolvedValue({ row: { job_payload: payload } });
  const response = { ok, json } as unknown as Response;
  const fetch = vi.fn().mockResolvedValue(response);

  vi.stubGlobal("fetch", fetch);
  return { fetch, json };
}

describe("history apply deep links", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds apply URLs with the encoded generation id", () => {
    expect(getApplyPath("tryon", "job id/1")).toBe("/create?apply=job%20id%2F1");
    expect(getApplyPath("garment3d", "abc123")).toBe("/garment-3d?apply=abc123");
  });

  it("loads the job payload from /api/history and clears the consumed apply parameter", async () => {
    const payload = {
      kind: "tryon",
      clothingUrls: ["https://example.com/shirt.png"],
      aiModel: "lingya" as never,
      aspectRatio: "1:1" as never,
      imageSize: "1024x1024" as never,
      genCount: 1,
    } satisfies Extract<HistoryJobPayload, { kind: "tryon" }>;
    const { replaceState } = mockWindow("https://example.com/create?foo=bar&apply=job%201#section");
    const { fetch } = mockHistoryResponse(payload);

    await expect(takeApplyPayload("tryon")).resolves.toEqual(payload);

    expect(fetch).toHaveBeenCalledWith("/api/history?id=job%201", {
      method: "GET",
      cache: "no-store",
    });
    expect(replaceState).toHaveBeenCalledWith({ from: "test" }, "", "/create?foo=bar#section");
  });

  it("returns null when the persisted payload kind does not match the requested module", async () => {
    const payload = {
      kind: "model",
      referenceUrls: ["https://example.com/model.png"],
      aiModel: "lingya" as never,
      aspectRatio: "1:1" as never,
      imageSize: "1024x1024" as never,
      prompt: "studio model",
      genCount: 1,
    } satisfies Extract<HistoryJobPayload, { kind: "model" }>;
    const { replaceState } = mockWindow("https://example.com/create?apply=model-job");
    mockHistoryResponse(payload);

    await expect(takeApplyPayload("tryon")).resolves.toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("returns null and logs a diagnostic message when loading fails", async () => {
    mockWindow("https://example.com/create?apply=missing-job");
    const error = new Error("network down");
    const fetch = vi.fn().mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", fetch);

    await expect(takeApplyPayload("tryon")).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalledWith("[history-apply] failed:", error);
  });
});
