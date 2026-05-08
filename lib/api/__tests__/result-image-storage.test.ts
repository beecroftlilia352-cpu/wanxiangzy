import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistGeneratedImageUrls } from "../result-image-storage";

describe("result image storage", () => {
  const originalKey = process.env.IMGBB_API_KEY;

  beforeEach(() => {
    process.env.IMGBB_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) {
      delete process.env.IMGBB_API_KEY;
    } else {
      process.env.IMGBB_API_KEY = originalKey;
    }
  });

  it("returns already-persisted ImgBB URLs without reuploading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://i.ibb.co/example/result.png";

    await expect(persistGeneratedImageUrls([url], "gen-1")).resolves.toEqual([url]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads remote result URLs directly instead of converting to base64", async () => {
    const uploadedImages: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.imgbb.com/1/upload");
      const body = init?.body as FormData;
      uploadedImages.push(body.get("image"));

      return Response.json({
        success: true,
        data: { url: "https://i.ibb.co/persisted/result.png" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistGeneratedImageUrls(["https://provider.example/result.png"], "gen-2")).resolves.toEqual([
      "https://i.ibb.co/persisted/result.png",
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploadedImages).toEqual(["https://provider.example/result.png"]);
  });

  it("falls back to the provider URL when ImgBB upload fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const providerUrl = "https://provider.example/result.png";

    await expect(persistGeneratedImageUrls([providerUrl], "gen-3")).resolves.toEqual([providerUrl]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[result-image-storage] generated image storage failed; falling back to provider URL:",
      "生成结果图片转存图床失败: 400"
    );
  });

  it("preserves generated result naming with start indexes", async () => {
    const uploadedNames: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData;
      uploadedNames.push(body.get("name"));

      return Response.json({
        success: true,
        data: { url: `https://i.ibb.co/persisted/${uploadedNames.length}.png` },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      persistGeneratedImageUrls(["data:image/png;base64,aaa", "data:image/png;base64,bbb"], "gen-4", {
        startIndex: 2,
      })
    ).resolves.toEqual(["https://i.ibb.co/persisted/1.png", "https://i.ibb.co/persisted/2.png"]);

    expect(uploadedNames).toEqual(["generated-gen-4-3", "generated-gen-4-4"]);
  });
});
