import { describe, expect, it } from "vitest";
import { getTryOnSourceLibraryItems } from "@/lib/tryon-source-library";

describe("getTryOnSourceLibraryItems", () => {
  it("flattens completed history result urls into selectable library items", () => {
    const items = getTryOnSourceLibraryItems([
      {
        id: "gen-1",
        created_at: "2026-05-09T00:00:00Z",
        result_urls: ["https://img.example/a.jpg", "https://img.example/b.jpg"],
        job_payload: { kind: "tryon" },
      },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: "gen-1:0",
        generationId: "gen-1",
        label: "服装上身 1",
        moduleLabel: "服装上身",
        url: "https://img.example/a.jpg",
      }),
      expect.objectContaining({
        id: "gen-1:1",
        label: "服装上身 2",
        url: "https://img.example/b.jpg",
      }),
    ]);
  });

  it("deduplicates urls and ignores malformed rows", () => {
    const items = getTryOnSourceLibraryItems([
      { id: "bad", result_urls: null },
      { id: "gen-1", result_urls: ["https://img.example/a.jpg"], job_payload: { kind: "model" } },
      { id: "gen-2", result_urls: ["https://img.example/a.jpg", ""], job_payload: { kind: "tryon" } },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: "专属模特",
      moduleLabel: "专属模特",
      url: "https://img.example/a.jpg",
    });
  });
});
