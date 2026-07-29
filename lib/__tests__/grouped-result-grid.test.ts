import { describe, expect, it } from "vitest";

import { buildImageTranslationGroupedCells } from "@/lib/image-translation";
describe("grouped result grid mapping", () => {
  it("keeps slot ↔ (source, target) mapping stable for 2 sources × 2 languages × 1", () => {
    const cells = buildImageTranslationGroupedCells({
      sourceCount: 2,
      targetCount: 2,
      perLanguageCount: 1,
      resultUrls: ["s0l0", "s0l1", "s1l0", "s1l1"],
      isGenerating: false,
      progress: 0,
      activeResultExpectedCount: 4,
    });
    expect(cells.map((cell) => `${cell.sourceId}::${cell.targetId}`)).toEqual([
      "source-0::lang-0",
      "source-0::lang-1",
      "source-1::lang-0",
      "source-1::lang-1",
    ]);
    expect(cells.map((cell) => cell.url)).toEqual(["s0l0", "s0l1", "s1l0", "s1l1"]);
  });

  it("marks empty slots as failed when generation finished without enough urls", () => {
    const cells = buildImageTranslationGroupedCells({
      sourceCount: 2,
      targetCount: 2,
      perLanguageCount: 1,
      resultUrls: ["only-one"],
      isGenerating: false,
      progress: 0,
      activeResultExpectedCount: 4,
      partialFailureMessage: "上游 429",
    });
    expect(cells.filter((cell) => cell.status === "completed")).toHaveLength(1);
    expect(cells.filter((cell) => cell.status === "failed")).toHaveLength(3);
    expect(cells[1].failureDetail).toBe("上游 429");
  });

  it("treats slots as idle when expectedCount has not started yet", () => {
    const cells = buildImageTranslationGroupedCells({
      sourceCount: 2,
      targetCount: 2,
      perLanguageCount: 1,
      resultUrls: [],
      isGenerating: false,
      progress: 0,
      activeResultExpectedCount: 5,
    });
    expect(cells.every((cell) => cell.status === "idle")).toBe(true);
  });

  it("marks partial slots as running while generation is in progress", () => {
    const cells = buildImageTranslationGroupedCells({
      sourceCount: 2,
      targetCount: 2,
      perLanguageCount: 1,
      resultUrls: ["s0l0", undefined, "s1l0", undefined],
      isGenerating: true,
      progress: 64,
      activeResultExpectedCount: 4,
    });
    const completed = cells.filter((cell) => cell.status === "completed");
    const running = cells.filter((cell) => cell.status === "running");
    expect(completed).toHaveLength(2);
    expect(running).toHaveLength(2);
    expect(running[0].progress).toBe(64);
  });

  it("expands perLanguageCount > 1 with extra rows", () => {
    const cells = buildImageTranslationGroupedCells({
      sourceCount: 1,
      targetCount: 2,
      perLanguageCount: 3,
      resultUrls: ["a", "b", "c", "d", "e", "f"],
      isGenerating: false,
      progress: 0,
      activeResultExpectedCount: 6,
    });
    expect(cells).toHaveLength(6);
    expect(cells.map((cell) => cell.url)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
