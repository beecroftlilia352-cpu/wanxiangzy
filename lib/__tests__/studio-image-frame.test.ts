import { describe, expect, it } from "vitest";
import {
  calculateFrameLayout,
  calculateOutpaintSourceRect,
  createAspectCropRect,
  createScaledOutpaintSourceRect,
  frameRectToNormalizedPosition,
  imagePointToTargetPoint,
  imagePointToViewportPoint,
  moveCropRect,
  moveOutpaintSourcePosition,
  outpaintAnchorToPosition,
  positionFrameRect,
  positionCoverFrameLayout,
  positionOutpaintSourceRect,
  resizeCropRect,
  targetPointToImagePoint,
  targetPointToViewportPoint,
  viewportPointToImagePoint,
  viewportPointToTargetPoint,
} from "@/components/studio/image-editor/frame-geometry";

describe("studio image frame fit geometry", () => {
  it("contains landscape and portrait sources without cropping", () => {
    const landscape = calculateFrameLayout(
      { width: 1600, height: 900 },
      { width: 1000, height: 1000 },
      "contain",
    );
    expect(landscape.sourceRect).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    expect(landscape.targetRect).toEqual({ x: 0, y: 218.75, width: 1000, height: 562.5 });
    expect(landscape.scaleX).toBeCloseTo(0.625);
    expect(landscape.scaleY).toBeCloseTo(0.625);

    const portrait = calculateFrameLayout(
      { width: 900, height: 1600 },
      { width: 1000, height: 1000 },
      "contain",
    );
    expect(portrait.targetRect).toEqual({ x: 218.75, y: 0, width: 562.5, height: 1000 });
  });

  it("covers the target by cropping the long source axis", () => {
    const landscape = calculateFrameLayout(
      { width: 1600, height: 900 },
      { width: 1000, height: 1000 },
      "cover",
    );
    expect(landscape.sourceRect).toEqual({ x: 350, y: 0, width: 900, height: 900 });
    expect(landscape.targetRect).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });

    const portrait = calculateFrameLayout(
      { width: 900, height: 1600 },
      { width: 1000, height: 1000 },
      "cover",
    );
    expect(portrait.sourceRect).toEqual({ x: 0, y: 350, width: 900, height: 900 });
  });

  it("fills the target with independent x and y scales", () => {
    const layout = calculateFrameLayout(
      { width: 1600, height: 900 },
      { width: 1000, height: 1000 },
      "fill",
    );
    expect(layout.sourceRect).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    expect(layout.targetRect).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(layout.scaleX).toBeCloseTo(0.625);
    expect(layout.scaleY).toBeCloseTo(1000 / 900);
  });

  it("shares normalized cover focal positioning with the processing API", () => {
    const centered = calculateFrameLayout(
      { width: 1600, height: 900 },
      { width: 1000, height: 1000 },
      "cover",
    );
    expect(positionCoverFrameLayout(centered, { x: 0, y: 0 }).sourceRect.x).toBe(0);
    expect(positionCoverFrameLayout(centered, { x: 1, y: 1 }).sourceRect.x).toBe(700);
    expect(positionCoverFrameLayout(centered, { x: 0.5, y: 0.5 }).sourceRect.x).toBe(350);
    expect(() => positionCoverFrameLayout(
      calculateFrameLayout({ width: 100, height: 100 }, { width: 200, height: 200 }, "contain"),
      { x: 0.5, y: 0.5 },
    )).toThrow("cover layouts");
  });

  it("rejects zero, negative, and non-finite dimensions", () => {
    expect(() => calculateFrameLayout(
      { width: 0, height: 900 },
      { width: 1000, height: 1000 },
      "contain",
    )).toThrow("sourceSize.width");
    expect(() => calculateFrameLayout(
      { width: 900, height: 900 },
      { width: Number.POSITIVE_INFINITY, height: 1000 },
      "cover",
    )).toThrow("targetSize.width");
  });
});

describe("studio image crop geometry", () => {
  it("creates centered aspect crops for landscape and portrait images", () => {
    expect(createAspectCropRect({ width: 1600, height: 900 }, 1)).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    });
    expect(createAspectCropRect({ width: 900, height: 1600 }, 1)).toEqual({
      x: 0,
      y: 350,
      width: 900,
      height: 900,
    });
  });

  it("moves a crop to boundaries without changing its aspect ratio", () => {
    const crop = { x: 200, y: 100, width: 800, height: 600 };
    const moved = moveCropRect(crop, { x: 10_000, y: -10_000 }, { width: 1600, height: 1200 });
    expect(moved).toEqual({ x: 800, y: 0, width: 800, height: 600 });
    expect(moved.width / moved.height).toBeCloseTo(4 / 3);
  });

  it("resizes from a corner at a fixed ratio and clamps to bounds", () => {
    const crop = { x: 400, y: 300, width: 800, height: 600 };
    const enlarged = resizeCropRect(
      crop,
      "north-west",
      { x: -10_000, y: -10_000 },
      { width: 1600, height: 1200 },
      4 / 3,
      { width: 120, height: 90 },
    );
    expect(enlarged).toEqual({ x: 0, y: 0, width: 1200, height: 900 });
    expect(enlarged.width / enlarged.height).toBeCloseTo(4 / 3);

    const shrunk = resizeCropRect(
      crop,
      "south-east",
      { x: -10_000, y: -10_000 },
      { width: 1600, height: 1200 },
      4 / 3,
      { width: 120, height: 90 },
    );
    expect(shrunk).toEqual({ x: 400, y: 300, width: 120, height: 90 });
  });

  it("rejects impossible input crops instead of leaking outside the image", () => {
    expect(() => moveCropRect(
      { x: -1, y: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
      { width: 500, height: 500 },
    )).toThrow("inside bounds");
    expect(() => createAspectCropRect({ width: 500, height: 500 }, 0)).toThrow("aspectRatio");
  });

  it("round-trips bounded frame positions through normalized free space", () => {
    const bounds = { width: 1600, height: 1200 };
    const frame = { x: 0, y: 0, width: 800, height: 600 };
    const positioned = positionFrameRect(frame, { x: 0.25, y: 0.75 }, bounds);
    expect(positioned).toEqual({ x: 200, y: 450, width: 800, height: 600 });
    expect(frameRectToNormalizedPosition(positioned, bounds)).toEqual({ x: 0.25, y: 0.75 });
    expect(frameRectToNormalizedPosition(
      { x: 0, y: 0, width: 1600, height: 1200 },
      bounds,
    )).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("studio outpaint anchors", () => {
  it.each([
    ["center", { x: 0.5, y: 0.5 }],
    ["left", { x: 0, y: 0.5 }],
    ["right", { x: 1, y: 0.5 }],
    ["top", { x: 0.5, y: 0 }],
    ["bottom", { x: 0.5, y: 1 }],
  ] as const)("keeps the %s legacy anchor aligned with the gateway position", (anchor, position) => {
    const source = { width: 800, height: 600 };
    const target = { width: 1600, height: 1200 };
    expect(outpaintAnchorToPosition(anchor)).toEqual(position);
    expect(calculateOutpaintSourceRect(source, target, anchor)).toEqual(
      positionOutpaintSourceRect(source, target, position),
    );
  });

  it("places a square source inside a wide target for horizontal anchors", () => {
    const source = { width: 1000, height: 1000 };
    const target = { width: 1600, height: 1000 };
    expect(calculateOutpaintSourceRect(source, target, "center")).toEqual({ x: 300, y: 0, width: 1000, height: 1000 });
    expect(calculateOutpaintSourceRect(source, target, "left")).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(calculateOutpaintSourceRect(source, target, "right")).toEqual({ x: 600, y: 0, width: 1000, height: 1000 });
  });

  it("places a square source inside a tall target for vertical anchors", () => {
    const source = { width: 1000, height: 1000 };
    const target = { width: 1000, height: 1600 };
    expect(calculateOutpaintSourceRect(source, target, "top")).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(calculateOutpaintSourceRect(source, target, "bottom")).toEqual({ x: 0, y: 600, width: 1000, height: 1000 });
  });

  it("keeps the orthogonal axis centered for a mismatched portrait target", () => {
    const rect = calculateOutpaintSourceRect(
      { width: 800, height: 600 },
      { width: 900, height: 1600 },
      "bottom",
    );
    expect(rect).toEqual({ x: 50, y: 1000, width: 800, height: 600 });
  });

  it("never scales source pixels and rejects smaller target canvases", () => {
    expect(calculateOutpaintSourceRect(
      { width: 512, height: 512 },
      { width: 800, height: 800 },
      "center",
    )).toEqual({ x: 144, y: 144, width: 512, height: 512 });
    expect(() => calculateOutpaintSourceRect(
      { width: 1600, height: 900 },
      { width: 900, height: 1600 },
      "center",
    )).toThrow("original pixel size");
  });

  it("uses the same normalized free-space position as the direct manipulation canvas", () => {
    const source = { width: 800, height: 600 };
    const target = { width: 1600, height: 1000 };
    expect(positionOutpaintSourceRect(source, target, { x: 0, y: 0 })).toEqual({
      x: 0, y: 0, width: 800, height: 600,
    });
    expect(positionOutpaintSourceRect(source, target, { x: 0.25, y: 0.75 })).toEqual({
      x: 200, y: 300, width: 800, height: 600,
    });
    expect(positionOutpaintSourceRect(source, target, { x: 2, y: -1 })).toEqual({
      x: 800, y: 0, width: 800, height: 600,
    });
  });

  it("converts target-pixel drag deltas into the exact normalized gateway position", () => {
    const source = { width: 800, height: 600 };
    const target = { width: 1600, height: 1000 };
    expect(moveOutpaintSourcePosition(
      source,
      target,
      { x: 0.5, y: 0.5 },
      { x: 200, y: -100 },
    )).toEqual({ x: 0.75, y: 0.25 });
    expect(moveOutpaintSourcePosition(
      source,
      target,
      { x: 0.5, y: 0.5 },
      { x: 10_000, y: -10_000 },
    )).toEqual({ x: 1, y: 0 });
    expect(moveOutpaintSourcePosition(
      { width: 800, height: 600 },
      { width: 1600, height: 600 },
      { x: 0.5, y: 0.1 },
      { x: 80, y: 500 },
    )).toEqual({ x: 0.6, y: 0.5 });
  });

  it("creates a uniformly scaled source rect and keeps it inside the outpaint canvas", () => {
    expect(createScaledOutpaintSourceRect(
      { width: 800, height: 600 },
      { width: 1600, height: 1200 },
      { x: 0.25, y: 0.75 },
      1.5,
    )).toEqual({ x: 100, y: 225, width: 1200, height: 900 });

    expect(createScaledOutpaintSourceRect(
      { width: 800, height: 600 },
      { width: 400, height: 300 },
      { x: 1, y: 1 },
    )).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("uses fixed-aspect corner resizing for outpaint source transforms", () => {
    const sourceAspect = 4 / 3;
    const resized = resizeCropRect(
      { x: 400, y: 300, width: 800, height: 600 },
      "south-east",
      { x: 200, y: 150 },
      { width: 1600, height: 1200 },
      sourceAspect,
      { width: 64, height: 48 },
    );
    expect(resized.x).toBe(400);
    expect(resized.y).toBe(300);
    expect(resized.width).toBeCloseTo(1000);
    expect(resized.height).toBeCloseTo(750);
    expect(resized.width / resized.height).toBeCloseTo(sourceAspect);
  });
});

describe("studio frame coordinate transforms", () => {
  it("round-trips image and target coordinates for cover and fill", () => {
    for (const mode of ["cover", "fill"] as const) {
      const layout = calculateFrameLayout(
        { width: 1600, height: 900 },
        { width: 1000, height: 1000 },
        mode,
      );
      const imagePoint = { x: 800, y: 450 };
      const targetPoint = imagePointToTargetPoint(layout, imagePoint);
      expect(targetPoint.x).toBeCloseTo(500);
      expect(targetPoint.y).toBeCloseTo(500);
      const restored = targetPointToImagePoint(layout, targetPoint);
      expect(restored.x).toBeCloseTo(imagePoint.x);
      expect(restored.y).toBeCloseTo(imagePoint.y);
    }
  });

  it("round-trips target and viewport coordinates", () => {
    const viewport = { x: 12, y: -8, scale: 0.5 };
    const targetPoint = { x: 500, y: 500 };
    const viewportPoint = targetPointToViewportPoint(targetPoint, viewport);
    expect(viewportPoint).toEqual({ x: 262, y: 242 });
    expect(viewportPointToTargetPoint(viewportPoint, viewport)).toEqual(targetPoint);
  });

  it("round-trips the full viewport-target-image chain", () => {
    const layout = calculateFrameLayout(
      { width: 900, height: 1600 },
      { width: 1200, height: 800 },
      "cover",
    );
    const viewport = { x: -37, y: 41, scale: 1.75 };
    const imagePoint = { x: 450, y: 800 };
    const viewportPoint = imagePointToViewportPoint(layout, viewport, imagePoint);
    const restored = viewportPointToImagePoint(layout, viewport, viewportPoint);
    expect(restored.x).toBeCloseTo(imagePoint.x);
    expect(restored.y).toBeCloseTo(imagePoint.y);
  });
});
