import { describe, expect, it } from "vitest";
import {
  assertSafeStudioImageDimensions,
  commitImageEditorDocument,
  createImageEditorSession,
  isDrawableStudioImageEditorStroke,
  redoImageEditorDocument,
  undoImageEditorDocument,
} from "@/components/studio/image-editor/types";
import {
  fitImageEditorViewport,
  viewportPointToNormalizedImagePoint,
  zoomImageEditorViewportAtPoint,
} from "@/components/studio/image-editor/geometry";
import {
  hasImageEditorToolStrokes,
  hasMaskPixelCoverage,
  hasVisibleMaskContent,
} from "@/components/studio/image-editor/mask-export";
import { readTrackedTouchPair } from "@/components/studio/image-editor/gesture";
import {
  getStudioImageEditorToolbarConfig,
  resolveStudioImageEditorToolbarVariant,
} from "@/components/studio/image-editor/toolbar-variants";
import { resolveMattingPreviewBase } from "@/components/studio/image-editor/matting-preview";

const brushDocument = {
  version: 1 as const,
  strokes: [{ id: "stroke-1", tool: "brush" as const, size: 0.04, points: [0.2, 0.3, 0.4, 0.5] }],
};

describe("Studio image editor geometry", () => {
  it("fits and centers an image without changing its aspect ratio", () => {
    expect(fitImageEditorViewport(
      { width: 1000, height: 700 },
      { width: 1600, height: 900 },
      20,
    )).toEqual({ x: 20, y: 80, scale: 0.6 });
  });

  it("maps viewport coordinates back to normalized canonical image coordinates", () => {
    const point = viewportPointToNormalizedImagePoint(
      { x: 500, y: 350 },
      { x: 20, y: 80, scale: 0.6 },
      { width: 1600, height: 900 },
    );
    expect(point?.x).toBeCloseTo(0.5);
    expect(point?.y).toBeCloseTo(0.5);
    expect(viewportPointToNormalizedImagePoint(
      { x: 0, y: 0 },
      { x: 20, y: 80, scale: 0.6 },
      { width: 1600, height: 900 },
    )).toBeNull();
  });

  it("keeps the image point below the cursor stable while zooming", () => {
    const pointer = { x: 320, y: 240 };
    const before = { x: 20, y: 40, scale: 0.5 };
    const after = zoomImageEditorViewportAtPoint(before, pointer, 1.25);
    expect((pointer.x - after.x) / after.scale).toBeCloseTo((pointer.x - before.x) / before.scale);
    expect((pointer.y - after.y) / after.scale).toBeCloseTo((pointer.y - before.y) / before.scale);
  });

  it("rejects unsafe canonical dimensions before allocating an export canvas", () => {
    expect(() => assertSafeStudioImageDimensions({ width: 8192, height: 3906 })).not.toThrow();
    expect(() => assertSafeStudioImageDimensions({ width: 8193, height: 100 })).toThrow("8192px");
    expect(() => assertSafeStudioImageDimensions({ width: 8000, height: 8000 })).toThrow("3200 万");
  });

  it("rejects zero-area shape gestures without creating phantom history", () => {
    const dimensions = { width: 1000, height: 800 };
    expect(isDrawableStudioImageEditorStroke(
      { id: "rectangle", tool: "rectangle", size: 0, points: [0.4, 0.4, 0.4, 0.7] },
      dimensions,
    )).toBe(false);
    expect(isDrawableStudioImageEditorStroke(
      { id: "ellipse", tool: "ellipse", size: 0, points: [0.4, 0.4, 0.7, 0.4] },
      dimensions,
    )).toBe(false);
    expect(isDrawableStudioImageEditorStroke(
      { id: "rectangle", tool: "rectangle", size: 0, points: [0.4, 0.4, 0.6, 0.7] },
      dimensions,
    )).toBe(true);
  });
});

describe("Studio image editor command history", () => {
  it("supports immutable undo and redo", () => {
    const empty = createImageEditorSession();
    const committed = commitImageEditorDocument(empty, brushDocument);
    expect(committed.present).toEqual(brushDocument);
    expect(committed.past).toHaveLength(1);
    expect(committed.past[0]).toBe(empty.present);
    expect(committed.present.strokes[0]).toBe(brushDocument.strokes[0]);

    const undone = undoImageEditorDocument(committed);
    expect(undone.present.strokes).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = redoImageEditorDocument(undone);
    expect(redone.present).toEqual(brushDocument);
    expect(redone.future).toHaveLength(0);
  });

  it("checks rendered binary mask pixels instead of stroke presence", () => {
    expect(hasMaskPixelCoverage(new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]))).toBe(false);
    expect(hasMaskPixelCoverage(new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]))).toBe(true);
  });

  it("detects whether a document contains a drawable selection", () => {
    expect(hasVisibleMaskContent(brushDocument)).toBe(true);
    expect(hasVisibleMaskContent({ version: 1, strokes: [] })).toBe(false);
    expect(hasVisibleMaskContent({
      version: 1,
      strokes: [{ id: "eraser", tool: "eraser", size: 0.1, points: [0, 0, 1, 1] }],
    })).toBe(false);
    expect(hasVisibleMaskContent({
      version: 1,
      strokes: [
        { id: "brush", tool: "brush", size: 0.2, points: [0.3, 0.4, 0.7, 0.4] },
        { id: "eraser", tool: "eraser", size: 0.2, points: [0.3, 0.4, 0.7, 0.4] },
      ],
    })).toBe(false);
    expect(hasVisibleMaskContent({
      version: 1,
      strokes: [{ id: "rectangle", tool: "rectangle", size: 0, points: [0.2, 0.3, 0.6, 0.7] }],
    })).toBe(true);
    expect(hasVisibleMaskContent({
      version: 1,
      strokes: [{ id: "ellipse", tool: "ellipse", size: 0, points: [0.2, 0.3, 0.6, 0.7] }],
    })).toBe(true);
    expect(hasVisibleMaskContent({
      version: 1,
      strokes: [{ id: "empty-shape", tool: "rectangle", size: 0, points: [0.3, 0.3, 0.3, 0.7] }],
    })).toBe(false);
  });

  it("keeps matting add and subtract operations independently detectable", () => {
    const document = {
      version: 1 as const,
      strokes: [
        ...brushDocument.strokes,
        { id: "remove", tool: "eraser" as const, size: 0.05, points: [0.6, 0.4, 0.7, 0.5] },
      ],
    };
    expect(hasImageEditorToolStrokes(document, "brush")).toBe(true);
    expect(hasImageEditorToolStrokes(document, "eraser")).toBe(true);
    expect(hasImageEditorToolStrokes({ version: 1, strokes: [] }, "eraser")).toBe(false);
  });
});

describe("Studio image editor touch tracking", () => {
  const touch = (identifier: number, clientX: number) => ({ identifier, clientX, clientY: 0 });

  it("locks a pinch to its original touch identifiers when ordering changes", () => {
    const started = readTrackedTouchPair([touch(4, 40), touch(9, 90)]);
    expect(started?.touchIds).toEqual([4, 9]);
    const continued = readTrackedTouchPair(
      [touch(12, 120), touch(9, 95), touch(4, 45)],
      started?.touchIds,
    );
    expect(continued?.first.clientX).toBe(45);
    expect(continued?.second.clientX).toBe(95);
  });

  it("ignores ambiguous initial multi-touch and ends when a tracked touch leaves", () => {
    expect(readTrackedTouchPair([touch(1, 10), touch(2, 20), touch(3, 30)])).toBeNull();
    expect(readTrackedTouchPair([touch(2, 20)], [1, 2])).toBeNull();
  });
});

describe("Studio image editor operation toolbars", () => {
  it("keeps erase as the compatible inpaint default", () => {
    expect(resolveStudioImageEditorToolbarVariant(undefined, "inpaint")).toBe("erase");
    expect(getStudioImageEditorToolbarConfig("erase")).toEqual({
      selectionActions: [],
      showBrush: true,
      showEraser: true,
      showShapes: true,
    });
  });

  it("exposes clothing selection actions without erase shapes", () => {
    expect(getStudioImageEditorToolbarConfig("clothing")).toEqual({
      selectionActions: ["smart", "auto", "add", "subtract"],
      showBrush: true,
      showEraser: true,
      showShapes: false,
    });
  });

  it("keeps shoe manual-only and gives matting the original selection actions", () => {
    expect(getStudioImageEditorToolbarConfig("shoe")).toEqual({
      selectionActions: [],
      showBrush: true,
      showEraser: true,
      showShapes: false,
    });
    expect(resolveStudioImageEditorToolbarVariant(undefined, "matting")).toBe("matting");
    expect(getStudioImageEditorToolbarConfig("matting")).toEqual({
      selectionActions: ["smart", "auto", "add", "subtract"],
      showBrush: true,
      showEraser: true,
      showShapes: false,
    });
  });
});

describe("Studio matting refinement preview", () => {
  it("uses the base foreground alpha before applying delta strokes", () => {
    const source = { id: "source" };
    const foreground = { id: "foreground-with-alpha" };
    expect(resolveMattingPreviewBase({ source, foreground, alpha: null })).toEqual({
      baseImage: foreground,
      alphaImage: null,
    });
  });

  it("can constrain the source with a separate base alpha matte", () => {
    const source = { id: "source" };
    const alpha = { id: "transparent-alpha-matte" };
    expect(resolveMattingPreviewBase({ source, foreground: null, alpha })).toEqual({
      baseImage: source,
      alphaImage: alpha,
    });
  });
});
