import type { StudioImageDimensions } from "./types";

export type StudioImageEditorViewport = {
  x: number;
  y: number;
  scale: number;
};

export type Point = { x: number; y: number };

export function fitImageEditorViewport(
  container: StudioImageDimensions,
  image: StudioImageDimensions,
  padding = 24,
): StudioImageEditorViewport {
  const availableWidth = Math.max(1, container.width - padding * 2);
  const availableHeight = Math.max(1, container.height - padding * 2);
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    x: (container.width - image.width * safeScale) / 2,
    y: (container.height - image.height * safeScale) / 2,
    scale: safeScale,
  };
}

export function viewportPointToNormalizedImagePoint(
  point: Point,
  viewport: StudioImageEditorViewport,
  image: StudioImageDimensions,
): Point | null {
  const x = (point.x - viewport.x) / viewport.scale;
  const y = (point.y - viewport.y) / viewport.scale;
  if (x < 0 || y < 0 || x > image.width || y > image.height) return null;
  return {
    x: clamp(x / image.width, 0, 1),
    y: clamp(y / image.height, 0, 1),
  };
}

export function zoomImageEditorViewportAtPoint(
  viewport: StudioImageEditorViewport,
  pointer: Point,
  nextScale: number,
): StudioImageEditorViewport {
  const safeScale = Math.max(0.01, nextScale);
  const imagePoint = {
    x: (pointer.x - viewport.x) / viewport.scale,
    y: (pointer.y - viewport.y) / viewport.scale,
  };
  return {
    x: pointer.x - imagePoint.x * safeScale,
    y: pointer.y - imagePoint.y * safeScale,
    scale: safeScale,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
