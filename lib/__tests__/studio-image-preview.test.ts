import { describe, expect, it } from "vitest";
import {
  buildImagePreviewResults,
  buildSourceImageHref,
  clearSourceImageParamFromUrl,
  compactMetaItems,
  createProductSetPreviewSession,
  createTryOnPreviewSession,
  getPreviewCanvasInputReferences,
  isValidSourceImageUrl,
  readSourceImageFromUrl,
} from "@/lib/studio-image-preview";
import { mergeRetryResultUrls } from "@/lib/result-slot-retry";

describe("studio image preview data", () => {
  it("builds try-on sessions from current state without empty meta rows", () => {
    const session = createTryOnPreviewSession({
      urls: ["https://example.com/result.png"],
      clothingUrls: ["https://example.com/coat.png"],
      referenceUrls: ["https://example.com/ref.png"],
      modelFaceUrl: "https://example.com/model.png",
      promptText: "让参考图模特穿上商品图的羽绒服",
      metaItems: [
        { label: "比例", value: "3:4" },
        { label: "空字段", value: "" },
      ],
    });

    expect(session.module).toBe("tryon");
    expect(session.results[0]).toMatchObject({ status: "completed", title: "服装上身结果" });
    expect(session.references?.map((item) => item.label)).toEqual(["服装", "参考图", "模特"]);
    expect(session.metaItems).toEqual([{ label: "比例", value: "3:4" }]);
    expect(session.promptText).toContain("羽绒服");
  });

  it("omits missing meta values", () => {
    expect(compactMetaItems([
      { label: "任务", value: "123" },
      { label: "空", value: null },
      { label: "空字符串", value: " " },
      { label: "数量", value: 2 },
    ])).toEqual([
      { label: "任务", value: "123" },
      { label: "数量", value: 2 },
    ]);
  });

  it("marks pending and failed result slots correctly", () => {
    expect(buildImagePreviewResults({
      urls: ["https://example.com/one.png"],
      expectedCount: 3,
      isGenerating: true,
      titlePrefix: "结果",
    }).map((item) => item.status)).toEqual(["completed", "running", "running"]);

    expect(buildImagePreviewResults({
      urls: [],
      expectedCount: 2,
      statusGroup: "failed",
      titlePrefix: "结果",
    }).map((item) => item.status)).toEqual(["failed", "failed"]);
  });

  it("preserves sparse result slots while a retry is filling one image", () => {
    const results = buildImagePreviewResults({
      urls: ["https://example.com/one.png", "", "https://example.com/three.png"],
      expectedCount: 4,
      isGenerating: true,
      titlePrefix: "结果",
    });

    expect(results.map((item) => item.url || "")).toEqual([
      "https://example.com/one.png",
      "",
      "https://example.com/three.png",
      "",
    ]);
    expect(results.map((item) => item.status)).toEqual(["completed", "running", "completed", "running"]);
  });

  it("does not keep completed preview slots in a loading state", () => {
    expect(buildImagePreviewResults({
      urls: ["https://example.com/one.png", "https://example.com/two.png"],
      expectedCount: 2,
      isGenerating: true,
      statusGroup: "completed",
      titlePrefix: "缁撴灉",
    }).map((item) => item.status)).toEqual(["completed", "completed"]);

    expect(buildImagePreviewResults({
      urls: ["https://example.com/one.png"],
      expectedCount: 2,
      isGenerating: true,
      statusGroup: "completed",
      titlePrefix: "缁撴灉",
    }).map((item) => item.status)).toEqual(["completed", "failed"]);

    expect(buildImagePreviewResults({
      urls: ["https://example.com/one.png", "https://example.com/two.png"],
      expectedCount: 2,
      isGenerating: true,
      statusGroup: "running",
      titlePrefix: "缁撴灉",
    }).map((item) => item.status)).toEqual(["completed", "completed"]);
  });

  it("merges a one-image retry back into the failed result slot", () => {
    expect(mergeRetryResultUrls(
      ["https://example.com/one.png", "https://example.com/two.png", "", ""],
      3,
      ["https://example.com/four.png"],
      4
    )).toEqual([
      "https://example.com/one.png",
      "https://example.com/two.png",
      "",
      "https://example.com/four.png",
    ]);
  });

  it("maps product-set module quality and per-slot errors", () => {
    const session = createProductSetPreviewSession({
      urls: ["https://example.com/hero.png"],
      expectedCount: 2,
      titles: ["首屏海报", "材质细节"],
      errors: [null, "材质图生成失败"],
      qualities: [{ score: 0.91, label: "优秀", issues: ["构图稳定"] }],
    });

    expect(session.results[0]).toMatchObject({
      title: "首屏海报",
      quality: { score: 0.91, label: "优秀", issues: ["构图稳定"] },
    });
    expect(session.results[1]).toMatchObject({
      title: "材质细节",
      status: "failed",
      error: "材质图生成失败",
    });
  });

  it("marks missing product-set slots failed after completion", () => {
    const session = createProductSetPreviewSession({
      urls: ["https://example.com/hero.png"],
      expectedCount: 2,
      isGenerating: true,
      statusGroup: "completed",
      titles: ["棣栧睆娴锋姤", "鏉愯川缁嗚妭"],
    });

    expect(session.results.map((item) => item.status)).toEqual(["completed", "failed"]);
  });

  it("selects canvas input references by module rules", () => {
    const references = [
      { url: "https://example.com/a.png", label: "参考图1", role: "reference" as const },
      { url: "https://example.com/b.png", label: "参考图2", role: "reference" as const },
      { url: "https://example.com/c.png", label: "模特", role: "model" as const },
    ];

    expect(getPreviewCanvasInputReferences({ module: "grass", references }).map((item) => item.url)).toEqual([
      "https://example.com/a.png",
    ]);
    expect(getPreviewCanvasInputReferences({ module: "model", references }).map((item) => item.url)).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
      "https://example.com/c.png",
    ]);
    expect(getPreviewCanvasInputReferences({
      module: "tryon",
      references: [
        { url: "https://example.com/top.png", label: "上装", role: "clothing" as const },
        { url: "https://example.com/bottom.png", label: "下装", role: "clothing" as const },
        { url: "https://example.com/ref.png", label: "参考图", role: "reference" as const },
      ],
    }).map((item) => item.url)).toEqual([
      "https://example.com/top.png",
      "https://example.com/bottom.png",
    ]);
  });
});

describe("sourceImage deep links", () => {
  it("accepts only http URLs", () => {
    expect(isValidSourceImageUrl("https://example.com/a.png")).toBe(true);
    expect(isValidSourceImageUrl("http://example.com/a.png")).toBe(true);
    expect(isValidSourceImageUrl("javascript:alert(1)")).toBe(false);
    expect(isValidSourceImageUrl("/local.png")).toBe(false);
  });

  it("builds, reads, and clears sourceImage links", () => {
    const href = buildSourceImageHref("/pose", "https://example.com/a.png", { mode: "single" });
    expect(href).toBe("/pose?sourceImage=https%3A%2F%2Fexample.com%2Fa.png&mode=single");
    expect(readSourceImageFromUrl(`https://local.test${href}`)).toBe("https://example.com/a.png");
    expect(clearSourceImageParamFromUrl(`https://local.test${href}`)).toBe("/pose?mode=single");
  });
});
