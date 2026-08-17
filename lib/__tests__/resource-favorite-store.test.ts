import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureResourceFavoriteStatus,
  getResourceFavoriteSnapshot,
  primeResourceFavorite,
  resetResourceFavoriteStoreForTests,
  toggleResourceFavorite,
} from "@/components/resource-library/resource-favorite-store";
import {
  createResourceFavoriteDescriptor,
  getResourceFavoriteKey,
  type ResourceFavoriteDescriptor,
} from "@/components/resource-library/resource-favorite-types";

const first: ResourceFavoriteDescriptor = {
  generationId: "11111111-1111-4111-8111-111111111111",
  resultIndex: 0,
  url: "https://cdn.example.com/result-1.png",
  moduleKey: "tryon",
  mediaType: "image",
};

const second: ResourceFavoriteDescriptor = {
  ...first,
  resultIndex: 1,
  url: "https://cdn.example.com/result-2.png",
};

beforeEach(() => {
  resetResourceFavoriteStoreForTests();
  vi.restoreAllMocks();
});

describe("resource favorite store", () => {
  it("rejects local task ids and keeps identical URLs separate by generation identity", () => {
    expect(createResourceFavoriteDescriptor({ generationId: "local-task", mediaType: "image" }, first.url, 0)).toBeNull();
    const anotherGeneration = { ...first, generationId: "22222222-2222-4222-8222-222222222222" };
    expect(getResourceFavoriteKey(first)).not.toBe(getResourceFavoriteKey(anotherGeneration));
  });

  it("batches status lookups and preserves generation/result-index identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      items: [
        { generationId: first.generationId, resultIndex: 0, assetId: "asset-0", saved: true },
        { generationId: second.generationId, resultIndex: 1, assetId: null, saved: false },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    ensureResourceFavoriteStatus(first);
    ensureResourceFavoriteStatus(second);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      items: [
        { generationId: first.generationId, resultIndex: 0 },
        { generationId: second.generationId, resultIndex: 1 },
      ],
    });
    await vi.waitFor(() => {
      expect(getResourceFavoriteSnapshot(getResourceFavoriteKey(first))).toMatchObject({
        isSaved: true,
        isChecking: false,
        assetId: "asset-0",
      });
    });
  });

  it("optimistically saves and deduplicates an in-flight mutation", async () => {
    const response = deferred<Response>();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(response.promise);
    primeResourceFavorite(first, { saved: false });

    const mutation = toggleResourceFavorite(first);
    const duplicate = toggleResourceFavorite(first);

    expect(duplicate).toBe(mutation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getResourceFavoriteSnapshot(getResourceFavoriteKey(first))).toMatchObject({
      isSaved: true,
      isPending: true,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      generationId: first.generationId,
      resultIndex: 0,
    });

    response.resolve(new Response(JSON.stringify({
      assets: [{ id: "asset-0", sourceGenerationId: first.generationId, sourceResultIndex: 0 }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await mutation;

    expect(getResourceFavoriteSnapshot(getResourceFavoriteKey(first))).toMatchObject({
      isSaved: true,
      isPending: false,
      assetId: "asset-0",
      error: null,
    });
  });

  it("rolls an optimistic save back when the API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "save failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }));
    primeResourceFavorite(first, { saved: false });

    await expect(toggleResourceFavorite(first)).rejects.toThrow("save failed");
    expect(getResourceFavoriteSnapshot(getResourceFavoriteKey(first))).toMatchObject({
      isSaved: false,
      isPending: false,
      assetId: null,
      error: "save failed",
    });
  });

  it("rolls an optimistic removal back and uses the asset id endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "remove failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));
    primeResourceFavorite(first, { saved: true, assetId: "asset/0" });

    const mutation = toggleResourceFavorite(first);
    expect(getResourceFavoriteSnapshot(getResourceFavoriteKey(first))).toMatchObject({
      isSaved: false,
      isPending: true,
    });
    await expect(mutation).rejects.toThrow("remove failed");

    expect(fetchMock).toHaveBeenCalledWith("/api/resource-library/assets/asset%2F0", { method: "DELETE" });
    expect(getResourceFavoriteSnapshot(getResourceFavoriteKey(first))).toMatchObject({
      isSaved: true,
      isPending: false,
      assetId: "asset/0",
      error: "remove failed",
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
