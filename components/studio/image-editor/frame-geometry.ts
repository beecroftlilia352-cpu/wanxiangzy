import type { Point, StudioImageEditorViewport } from "./geometry";
import type { StudioImageDimensions } from "./types";

export type FrameFitMode = "contain" | "cover" | "fill";
export type OutpaintAnchor = "center" | "top" | "bottom" | "left" | "right";
export type CropResizeHandle = "north-west" | "north-east" | "south-west" | "south-east";

export type FrameRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

/**
 * Describes which source-image pixels are mapped into which target-canvas pixels.
 * `sourceRect` is expressed in source/image coordinates; `targetRect` is expressed
 * in target/output coordinates.
 */
export type FrameLayout = Readonly<{
  mode: FrameFitMode;
  sourceSize: StudioImageDimensions;
  targetSize: StudioImageDimensions;
  sourceRect: FrameRect;
  targetRect: FrameRect;
  scaleX: number;
  scaleY: number;
}>;

const EPSILON = 1e-9;

/**
 * Computes the same three geometries as CSS object-fit, while retaining both
 * rectangles so the layout can be sent to an image API without relying on CSS.
 */
export function calculateFrameLayout(
  sourceSize: StudioImageDimensions,
  targetSize: StudioImageDimensions,
  mode: FrameFitMode,
): FrameLayout {
  assertFrameSize(sourceSize, "sourceSize");
  assertFrameSize(targetSize, "targetSize");

  const fullSource = rect(0, 0, sourceSize.width, sourceSize.height);
  const fullTarget = rect(0, 0, targetSize.width, targetSize.height);
  let sourceRect = fullSource;
  let targetRect = fullTarget;

  if (mode === "contain") {
    const scale = Math.min(
      targetSize.width / sourceSize.width,
      targetSize.height / sourceSize.height,
    );
    const width = sourceSize.width * scale;
    const height = sourceSize.height * scale;
    targetRect = rect(
      (targetSize.width - width) / 2,
      (targetSize.height - height) / 2,
      width,
      height,
    );
  } else if (mode === "cover") {
    const sourceAspect = sourceSize.width / sourceSize.height;
    const targetAspect = targetSize.width / targetSize.height;
    if (sourceAspect > targetAspect) {
      const width = sourceSize.height * targetAspect;
      sourceRect = rect((sourceSize.width - width) / 2, 0, width, sourceSize.height);
    } else if (sourceAspect < targetAspect) {
      const height = sourceSize.width / targetAspect;
      sourceRect = rect(0, (sourceSize.height - height) / 2, sourceSize.width, height);
    }
  } else if (mode !== "fill") {
    return assertNever(mode);
  }

  return {
    mode,
    sourceSize: { ...sourceSize },
    targetSize: { ...targetSize },
    sourceRect,
    targetRect,
    scaleX: targetRect.width / sourceRect.width,
    scaleY: targetRect.height / sourceRect.height,
  };
}

/** Repositions a cover crop using a normalized focal point shared by UI and API. */
export function positionCoverFrameLayout(layout: FrameLayout, position: Point): FrameLayout {
  if (layout.mode !== "cover") throw new RangeError("position is only supported for cover layouts");
  assertPoint(position, "position");
  const freeWidth = Math.max(0, layout.sourceSize.width - layout.sourceRect.width);
  const freeHeight = Math.max(0, layout.sourceSize.height - layout.sourceRect.height);
  return {
    ...layout,
    sourceRect: {
      ...layout.sourceRect,
      x: freeWidth * clamp(position.x, 0, 1),
      y: freeHeight * clamp(position.y, 0, 1),
    },
  };
}

/** Creates the largest centered crop with the requested width / height ratio. */
export function createAspectCropRect(
  bounds: StudioImageDimensions,
  aspectRatio: number,
  coverage = 1,
): FrameRect {
  assertFrameSize(bounds, "bounds");
  assertPositiveFinite(aspectRatio, "aspectRatio");
  if (!Number.isFinite(coverage) || coverage <= 0 || coverage > 1) {
    throw new RangeError("coverage must be greater than 0 and at most 1");
  }

  const boundsAspect = bounds.width / bounds.height;
  const width = boundsAspect > aspectRatio
    ? bounds.height * aspectRatio * coverage
    : bounds.width * coverage;
  const height = boundsAspect > aspectRatio
    ? bounds.height * coverage
    : (bounds.width / aspectRatio) * coverage;

  return rect(
    (bounds.width - width) / 2,
    (bounds.height - height) / 2,
    width,
    height,
  );
}

/** Moves a crop without changing its size or aspect ratio, clamped to the image. */
export function moveCropRect(
  crop: FrameRect,
  delta: Point,
  bounds: StudioImageDimensions,
): FrameRect {
  assertCropInsideBounds(crop, bounds);
  assertPoint(delta, "delta");
  return rect(
    clamp(crop.x + delta.x, 0, bounds.width - crop.width),
    clamp(crop.y + delta.y, 0, bounds.height - crop.height),
    crop.width,
    crop.height,
  );
}

/** Positions an existing rectangle from normalized free-space coordinates. */
export function positionFrameRect(
  frame: FrameRect,
  position: Point,
  bounds: StudioImageDimensions,
): FrameRect {
  assertCropInsideBounds(frame, bounds);
  assertPoint(position, "position");
  const freeWidth = bounds.width - frame.width;
  const freeHeight = bounds.height - frame.height;
  return rect(
    freeWidth > 0 ? freeWidth * clamp(position.x, 0, 1) : 0,
    freeHeight > 0 ? freeHeight * clamp(position.y, 0, 1) : 0,
    frame.width,
    frame.height,
  );
}

/** Converts a bounded rectangle back to normalized free-space coordinates. */
export function frameRectToNormalizedPosition(
  frame: FrameRect,
  bounds: StudioImageDimensions,
): Point {
  assertCropInsideBounds(frame, bounds);
  const freeWidth = bounds.width - frame.width;
  const freeHeight = bounds.height - frame.height;
  return {
    x: freeWidth > EPSILON ? clamp(frame.x / freeWidth, 0, 1) : 0.5,
    y: freeHeight > EPSILON ? clamp(frame.y / freeHeight, 0, 1) : 0.5,
  };
}

/**
 * Resizes a crop from a corner while fixing the opposite corner. Pointer motion
 * is projected onto the aspect-ratio diagonal, then clamped to image bounds.
 */
export function resizeCropRect(
  crop: FrameRect,
  handle: CropResizeHandle,
  delta: Point,
  bounds: StudioImageDimensions,
  aspectRatio: number,
  minimum: Partial<StudioImageDimensions> = {},
): FrameRect {
  assertCropInsideBounds(crop, bounds);
  assertPoint(delta, "delta");
  assertPositiveFinite(aspectRatio, "aspectRatio");

  const minWidth = minimum.width ?? 1;
  const minHeight = minimum.height ?? 1;
  assertPositiveFinite(minWidth, "minimum.width");
  assertPositiveFinite(minHeight, "minimum.height");

  const horizontalDirection = handle.endsWith("east") ? 1 : -1;
  const verticalDirection = handle.startsWith("south") ? 1 : -1;
  const anchor = oppositeCorner(crop, handle);
  const moving = movingCorner(crop, handle);
  const localWidth = horizontalDirection * (moving.x + delta.x - anchor.x);
  const localHeight = verticalDirection * (moving.y + delta.y - anchor.y);

  // Orthogonal projection onto width = height * aspectRatio uses both pointer
  // axes and avoids the jump caused by arbitrarily preferring x or y movement.
  const projectedHeight = (
    localWidth * aspectRatio + localHeight
  ) / (aspectRatio * aspectRatio + 1);
  const maximumWidth = horizontalDirection > 0 ? bounds.width - anchor.x : anchor.x;
  const maximumHeight = verticalDirection > 0 ? bounds.height - anchor.y : anchor.y;
  const maxHeightAtRatio = Math.min(maximumHeight, maximumWidth / aspectRatio);
  const requestedMinimumHeight = Math.max(minHeight, minWidth / aspectRatio);
  const effectiveMinimumHeight = Math.min(requestedMinimumHeight, maxHeightAtRatio);
  const height = clamp(projectedHeight, effectiveMinimumHeight, maxHeightAtRatio);
  const width = height * aspectRatio;

  return rect(
    horizontalDirection > 0 ? anchor.x : anchor.x - width,
    verticalDirection > 0 ? anchor.y : anchor.y - height,
    width,
    height,
  );
}

/**
 * Returns the rectangle occupied by the unchanged source image in target/output
 * coordinates. Remaining target pixels are the area that outpainting may fill.
 */
export function calculateOutpaintSourceRect(
  sourceSize: StudioImageDimensions,
  targetSize: StudioImageDimensions,
  anchor: OutpaintAnchor,
): FrameRect {
  return positionOutpaintSourceRect(sourceSize, targetSize, outpaintAnchorToPosition(anchor));
}

/** Maps the legacy anchor preset onto the normalized position sent to gateways. */
export function outpaintAnchorToPosition(anchor: OutpaintAnchor): Point {
  if (anchor === "left") return { x: 0, y: 0.5 };
  if (anchor === "right") return { x: 1, y: 0.5 };
  if (anchor === "top") return { x: 0.5, y: 0 };
  if (anchor === "bottom") return { x: 0.5, y: 1 };
  if (anchor === "center") return { x: 0.5, y: 0.5 };
  return assertNever(anchor);
}

/**
 * Positions the unchanged source image inside a larger outpaint canvas using
 * the same normalized coordinates emitted by the interactive canvas.
 */
export function positionOutpaintSourceRect(
  sourceSize: StudioImageDimensions,
  targetSize: StudioImageDimensions,
  position: Point,
): FrameRect {
  assertFrameSize(sourceSize, "sourceSize");
  assertFrameSize(targetSize, "targetSize");
  assertPoint(position, "position");
  if (targetSize.width < sourceSize.width || targetSize.height < sourceSize.height) {
    throw new RangeError("outpaint target must contain the source at its original pixel size");
  }
  return rect(
    (targetSize.width - sourceSize.width) * clamp(position.x, 0, 1),
    (targetSize.height - sourceSize.height) * clamp(position.y, 0, 1),
    sourceSize.width,
    sourceSize.height,
  );
}

/**
 * Creates a movable/scalable source rectangle for the outpaint canvas. The
 * scale is uniform, keeps source pixels undistorted, and is clamped so the
 * source remains fully inside the target canvas.
 */
export function createScaledOutpaintSourceRect(
  sourceSize: StudioImageDimensions,
  targetSize: StudioImageDimensions,
  position: Point,
  scale = 1,
): FrameRect {
  assertFrameSize(sourceSize, "sourceSize");
  assertFrameSize(targetSize, "targetSize");
  assertPoint(position, "position");
  assertPositiveFinite(scale, "scale");
  const maximumScale = Math.min(
    targetSize.width / sourceSize.width,
    targetSize.height / sourceSize.height,
  );
  if (maximumScale <= 0) throw new RangeError("outpaint source cannot fit target canvas");
  const fittedScale = Math.min(scale, maximumScale);
  const frame = rect(
    0,
    0,
    sourceSize.width * fittedScale,
    sourceSize.height * fittedScale,
  );
  return positionFrameRect(frame, position, targetSize);
}

/** Converts a pointer delta in target pixels into the normalized gateway position. */
export function moveOutpaintSourcePosition(
  sourceSize: StudioImageDimensions,
  targetSize: StudioImageDimensions,
  position: Point,
  deltaTarget: Point,
): Point {
  assertFrameSize(sourceSize, "sourceSize");
  assertFrameSize(targetSize, "targetSize");
  assertPoint(position, "position");
  assertPoint(deltaTarget, "deltaTarget");
  if (targetSize.width < sourceSize.width || targetSize.height < sourceSize.height) {
    throw new RangeError("outpaint target must contain the source at its original pixel size");
  }
  const freeWidth = targetSize.width - sourceSize.width;
  const freeHeight = targetSize.height - sourceSize.height;
  return {
    x: freeWidth > 0 ? clamp(position.x + deltaTarget.x / freeWidth, 0, 1) : 0.5,
    y: freeHeight > 0 ? clamp(position.y + deltaTarget.y / freeHeight, 0, 1) : 0.5,
  };
}

/** Maps a point from canonical source/image pixels into target/output pixels. */
export function imagePointToTargetPoint(layout: FrameLayout, point: Point): Point {
  assertPoint(point, "point");
  return {
    x: layout.targetRect.x + (point.x - layout.sourceRect.x) * layout.scaleX,
    y: layout.targetRect.y + (point.y - layout.sourceRect.y) * layout.scaleY,
  };
}

/** Exact inverse of imagePointToTargetPoint; values are intentionally unclamped. */
export function targetPointToImagePoint(layout: FrameLayout, point: Point): Point {
  assertPoint(point, "point");
  return {
    x: layout.sourceRect.x + (point.x - layout.targetRect.x) / layout.scaleX,
    y: layout.sourceRect.y + (point.y - layout.targetRect.y) / layout.scaleY,
  };
}

/** Maps target/output coordinates onto the interactive viewport. */
export function targetPointToViewportPoint(
  point: Point,
  viewport: StudioImageEditorViewport,
): Point {
  assertPoint(point, "point");
  assertViewport(viewport);
  return {
    x: viewport.x + point.x * viewport.scale,
    y: viewport.y + point.y * viewport.scale,
  };
}

/** Exact inverse of targetPointToViewportPoint. */
export function viewportPointToTargetPoint(
  point: Point,
  viewport: StudioImageEditorViewport,
): Point {
  assertPoint(point, "point");
  assertViewport(viewport);
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function imagePointToViewportPoint(
  layout: FrameLayout,
  viewport: StudioImageEditorViewport,
  point: Point,
): Point {
  return targetPointToViewportPoint(imagePointToTargetPoint(layout, point), viewport);
}

export function viewportPointToImagePoint(
  layout: FrameLayout,
  viewport: StudioImageEditorViewport,
  point: Point,
): Point {
  return targetPointToImagePoint(layout, viewportPointToTargetPoint(point, viewport));
}

function oppositeCorner(crop: FrameRect, handle: CropResizeHandle): Point {
  return {
    x: handle.endsWith("east") ? crop.x : crop.x + crop.width,
    y: handle.startsWith("south") ? crop.y : crop.y + crop.height,
  };
}

function movingCorner(crop: FrameRect, handle: CropResizeHandle): Point {
  return {
    x: handle.endsWith("east") ? crop.x + crop.width : crop.x,
    y: handle.startsWith("south") ? crop.y + crop.height : crop.y,
  };
}

function assertCropInsideBounds(crop: FrameRect, bounds: StudioImageDimensions) {
  assertFrameSize(bounds, "bounds");
  assertRect(crop, "crop");
  if (
    crop.x < -EPSILON
    || crop.y < -EPSILON
    || crop.x + crop.width > bounds.width + EPSILON
    || crop.y + crop.height > bounds.height + EPSILON
  ) {
    throw new RangeError("crop must stay inside bounds");
  }
}

function assertFrameSize(size: StudioImageDimensions, name: string) {
  assertPositiveFinite(size.width, `${name}.width`);
  assertPositiveFinite(size.height, `${name}.height`);
}

function assertRect(value: FrameRect, name: string) {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new RangeError(`${name} origin must be finite`);
  }
  assertPositiveFinite(value.width, `${name}.width`);
  assertPositiveFinite(value.height, `${name}.height`);
}

function assertPoint(value: Point, name: string) {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new RangeError(`${name} must contain finite coordinates`);
  }
}

function assertViewport(viewport: StudioImageEditorViewport) {
  if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y)) {
    throw new RangeError("viewport origin must be finite");
  }
  assertPositiveFinite(viewport.scale, "viewport.scale");
}

function assertPositiveFinite(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function rect(x: number, y: number, width: number, height: number): FrameRect {
  return { x, y, width, height };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function assertNever(value: never): never {
  throw new RangeError(`Unsupported frame option: ${String(value)}`);
}
