"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import "konva/lib/shapes/Circle";
import "konva/lib/shapes/Image";
import "konva/lib/shapes/Rect";
import {
  Circle,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
} from "react-konva/lib/ReactKonvaCore";
import {
  createAspectCropRect,
  createScaledOutpaintSourceRect,
  frameRectToNormalizedPosition,
  moveCropRect,
  outpaintAnchorToPosition,
  positionFrameRect,
  resizeCropRect,
  type CropResizeHandle,
  type FrameRect,
} from "./frame-geometry";
import { fitImageEditorViewport, type Point, type StudioImageEditorViewport } from "./geometry";
import type {
  StudioFrameEditorProps,
  StudioFrameTransform,
} from "./StudioFrameEditor";
import type { StudioImageDimensions } from "./types";
import styles from "./studio-frame-editor.module.css";

const DEFAULT_STAGE_SIZE = { width: 720, height: 560 };
const DEFAULT_CROP_POSITION = { x: 0.5, y: 0.5 };
const FRAME_BLUE = "#4263eb";
const FRAME_HANDLE_RADIUS = 5;
const MINIMUM_HANDLE_DISTANCE = 28;

type FrameInteraction = Readonly<{
  kind: "move" | "resize";
  pointer: Point;
  rect: FrameRect;
  handle?: CropResizeHandle;
  viewport: StudioImageEditorViewport;
}>;

type HandlePoint = Readonly<{
  handle: CropResizeHandle;
  point: Point;
  cursor: "nwse-resize" | "nesw-resize";
}>;

export function StudioFrameEditorClient({
  sourceId,
  sourceUrl,
  sourceName,
  sourceDimensions,
  targetDimensions,
  editorMode,
  anchor = "center",
  cropPosition: controlledCropPosition,
  disabled = false,
  transform: controlledTransform,
  defaultTransform,
  view = "detail",
  onTransformChange,
  onRequestViewChange,
  onCropPositionChange,
}: StudioFrameEditorProps) {
  const legacyPosition = controlledCropPosition
    || (editorMode === "outpaint" ? outpaintAnchorToPosition(anchor) : DEFAULT_CROP_POSITION);
  const defaultFrame = defaultTransform ? transformRect(defaultTransform) : undefined;
  const defaultKind = defaultTransform?.kind;
  const defaultX = defaultFrame?.x;
  const defaultY = defaultFrame?.y;
  const defaultWidth = defaultFrame?.width;
  const defaultHeight = defaultFrame?.height;
  const sourceWidth = sourceDimensions.width;
  const sourceHeight = sourceDimensions.height;
  const targetWidth = targetDimensions.width;
  const targetHeight = targetDimensions.height;
  const initialTransform = useMemo(
    () => defaultKind === editorMode
      && defaultX !== undefined
      && defaultY !== undefined
      && defaultWidth !== undefined
      && defaultHeight !== undefined
      ? createTransform(editorMode, {
        x: defaultX,
        y: defaultY,
        width: defaultWidth,
        height: defaultHeight,
      })
      : createDefaultTransform(
        editorMode,
        { width: sourceWidth, height: sourceHeight },
        { width: targetWidth, height: targetHeight },
        { x: legacyPosition.x, y: legacyPosition.y },
      ),
    [
      defaultHeight,
      defaultKind,
      defaultWidth,
      defaultX,
      defaultY,
      editorMode,
      legacyPosition.x,
      legacyPosition.y,
      sourceHeight,
      sourceWidth,
      targetHeight,
      targetWidth,
    ],
  );
  const transformResetKey = [
    sourceId,
    editorMode,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    defaultKind || "",
    defaultX ?? "",
    defaultY ?? "",
    defaultWidth ?? "",
    defaultHeight ?? "",
    onCropPositionChange ? "legacy-callback" : `${legacyPosition.x}:${legacyPosition.y}`,
  ].join(":");
  const [uncontrolledState, setUncontrolledState] = useState({
    key: transformResetKey,
    transform: initialTransform,
  });
  const uncontrolledTransform = uncontrolledState.key === transformResetKey
    ? uncontrolledState.transform
    : initialTransform;
  const activeTransform = matchingTransform(controlledTransform, editorMode)
    || uncontrolledTransform;
  const frameRect = transformRect(activeTransform);
  const frameBounds = editorMode === "outpaint" ? targetDimensions : sourceDimensions;
  const frameAspect = editorMode === "outpaint"
    ? sourceDimensions.width / sourceDimensions.height
    : targetDimensions.width / targetDimensions.height;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const interactionRef = useRef<FrameInteraction | null>(null);
  const pendingTransformRef = useRef<StudioFrameTransform | null>(null);
  const transformFrameRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState<StudioImageDimensions>(DEFAULT_STAGE_SIZE);
  const [imageState, setImageState] = useState<{ image: HTMLImageElement | null; error: string | null }>({
    image: null,
    error: null,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setStageSize({
        width: Math.max(280, Math.round(rect.width)),
        height: Math.max(360, Math.round(rect.height)),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (transformFrameRef.current !== null) window.cancelAnimationFrame(transformFrameRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setImageState({ image: null, error: null });
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setImageState({ image, error: null });
    };
    image.onerror = () => {
      if (!cancelled) setImageState({ image: null, error: "规范化原图加载失败，请重新上传" });
    };
    image.src = sourceUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [sourceId, sourceUrl]);

  const targetViewport = useMemo(
    () => fitReferenceViewport(stageSize, targetDimensions),
    [stageSize, targetDimensions],
  );
  const sourceViewport = useMemo(
    () => fitReferenceViewport(stageSize, sourceDimensions),
    [sourceDimensions, stageSize],
  );
  const interactionViewport = editorMode === "outpaint" ? targetViewport : sourceViewport;
  const interactive = view === "detail" && !disabled;

  const publishTransform = (nextTransform: StudioFrameTransform) => {
    if (!matchingTransform(controlledTransform, editorMode)) {
      setUncontrolledState({ key: transformResetKey, transform: nextTransform });
    }
    onTransformChange?.(nextTransform);
    const nextRect = transformRect(nextTransform);
    onCropPositionChange?.(frameRectToNormalizedPosition(nextRect, frameBounds));
  };

  const queueTransform = (nextRect: FrameRect) => {
    pendingTransformRef.current = createTransform(editorMode, nextRect);
    if (transformFrameRef.current !== null) return;
    transformFrameRef.current = window.requestAnimationFrame(() => {
      transformFrameRef.current = null;
      const nextTransform = pendingTransformRef.current;
      pendingTransformRef.current = null;
      if (nextTransform) publishTransform(nextTransform);
    });
  };

  const pointerPosition = () => stageRef.current?.getPointerPosition() || null;
  const beginInteraction = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
    kind: FrameInteraction["kind"],
    handle?: CropResizeHandle,
  ) => {
    if (!interactive) return;
    if ("button" in event.evt && event.evt.button !== 0) return;
    const pointer = pointerPosition();
    if (!pointer) return;
    event.cancelBubble = true;
    interactionRef.current = {
      kind,
      pointer,
      rect: frameRect,
      handle,
      viewport: interactionViewport,
    };
    containerRef.current?.focus();
  };

  const continueInteraction = () => {
    const active = interactionRef.current;
    const pointer = pointerPosition();
    if (!active || !pointer) return;
    const delta = {
      x: (pointer.x - active.pointer.x) / active.viewport.scale,
      y: (pointer.y - active.pointer.y) / active.viewport.scale,
    };
    if (active.kind === "move") {
      queueTransform(moveCropRect(active.rect, delta, frameBounds));
      return;
    }
    if (!active.handle) return;
    const minimum = minimumFrameSize(frameBounds, frameAspect, active.viewport.scale);
    queueTransform(resizeCropRect(
      active.rect,
      active.handle,
      delta,
      frameBounds,
      frameAspect,
      minimum,
    ));
  };

  const endInteraction = () => {
    if (transformFrameRef.current !== null) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = null;
    }
    const nextTransform = pendingTransformRef.current;
    pendingTransformRef.current = null;
    if (nextTransform) publishTransform(nextTransform);
    interactionRef.current = null;
    resetStageCursor(containerRef.current, interactive);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (view === "preview" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onRequestViewChange?.("detail");
      return;
    }
    if (!interactive) return;
    const movement = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    const pixels = event.shiftKey ? 10 : 1;
    queueTransform(moveCropRect(frameRect, {
      x: movement.x * pixels / interactionViewport.scale,
      y: movement.y * pixels / interactionViewport.scale,
    }, frameBounds));
  };

  const requestDetail = () => {
    if (view === "preview" && !disabled) onRequestViewChange?.("detail");
  };

  const frameViewportRect = toViewportRect(frameRect, interactionViewport);
  const selectionHandles = frameHandlePoints(frameRect, interactionViewport);
  const description = editorMode === "outpaint"
    ? "可拖动原图，并从四角等比缩放；画布空白区域将由 AI 补画"
    : "可移动并缩放高亮裁剪框，框内区域即最终输出";

  return (
    <section
      className={styles.editor}
      data-view={view}
      aria-label={editorMode === "outpaint" ? "扩图画布编辑器" : "改尺寸画布编辑器"}
    >
      <div className={styles.headingRow}>
        <strong>{editorMode === "outpaint" ? "调整扩图区域" : "调整修改区域"}</strong>
        <span>{targetDimensions.width} × {targetDimensions.height}px</span>
      </div>

      <div
        ref={containerRef}
        className={styles.stage}
        data-interactive={interactive ? "true" : undefined}
        data-preview={view === "preview" ? "true" : undefined}
        tabIndex={interactive || (view === "preview" && onRequestViewChange) ? 0 : -1}
        role={view === "preview" && onRequestViewChange ? "button" : undefined}
        onClick={requestDetail}
        onKeyDown={handleKeyDown}
        aria-label={view === "preview" && onRequestViewChange ? `${description}，点击进入调整详情` : description}
        title={`正在编辑：${sourceName}`}
      >
        {imageState.error ? <div className={styles.message} role="alert">{imageState.error}</div> : null}
        {!imageState.image && !imageState.error ? <div className={styles.message}>正在读取规范化原图…</div> : null}
        {imageState.image ? (
          <>
            {editorMode === "outpaint" ? (
              <div
                className={styles.outputFrame}
                style={viewportRectStyle(toViewportRect(
                  { x: 0, y: 0, width: targetDimensions.width, height: targetDimensions.height },
                  targetViewport,
                ))}
                aria-hidden="true"
              />
            ) : null}
            <Stage
              ref={stageRef}
              width={stageSize.width}
              height={stageSize.height}
              onMouseMove={continueInteraction}
              onMouseUp={endInteraction}
              onMouseLeave={endInteraction}
              onTouchMove={continueInteraction}
              onTouchEnd={endInteraction}
              onTouchCancel={endInteraction}
            >
              <Layer listening>
                {editorMode === "outpaint" ? (
                  <KonvaImage
                    image={imageState.image}
                    x={frameViewportRect.x}
                    y={frameViewportRect.y}
                    width={frameViewportRect.width}
                    height={frameViewportRect.height}
                    opacity={disabled ? 0.7 : 1}
                    onMouseDown={(event) => beginInteraction(event, "move")}
                    onTouchStart={(event) => beginInteraction(event, "move")}
                    onMouseEnter={() => setStageCursor(containerRef.current, interactive ? "grab" : "default")}
                    onMouseLeave={() => resetStageCursor(containerRef.current, interactive)}
                  />
                ) : (
                  <>
                    <KonvaImage
                      image={imageState.image}
                      x={sourceViewport.x}
                      y={sourceViewport.y}
                      width={sourceDimensions.width * sourceViewport.scale}
                      height={sourceDimensions.height * sourceViewport.scale}
                      opacity={disabled ? 0.7 : 1}
                    />
                    {cropMaskRects(frameRect, sourceDimensions).map((mask, index) => {
                      const maskRect = toViewportRect(mask, sourceViewport);
                      return (
                        <Rect
                          key={`${index}:${mask.x}:${mask.y}`}
                          x={maskRect.x}
                          y={maskRect.y}
                          width={maskRect.width}
                          height={maskRect.height}
                          fill="rgba(255, 255, 255, 0.58)"
                          listening={false}
                        />
                      );
                    })}
                    <Rect
                      x={frameViewportRect.x}
                      y={frameViewportRect.y}
                      width={frameViewportRect.width}
                      height={frameViewportRect.height}
                      fill="rgba(255,255,255,0.001)"
                      onMouseDown={(event) => beginInteraction(event, "move")}
                      onTouchStart={(event) => beginInteraction(event, "move")}
                      onMouseEnter={() => setStageCursor(containerRef.current, interactive ? "grab" : "default")}
                      onMouseLeave={() => resetStageCursor(containerRef.current, interactive)}
                    />
                  </>
                )}

                {view === "detail" ? (
                  <>
                    <Rect
                      x={frameViewportRect.x}
                      y={frameViewportRect.y}
                      width={frameViewportRect.width}
                      height={frameViewportRect.height}
                      stroke={FRAME_BLUE}
                      strokeWidth={2}
                      dash={[6, 4]}
                      listening={false}
                    />
                    {selectionHandles.map(({ handle, point, cursor }) => (
                      <Circle
                        key={handle}
                        x={point.x}
                        y={point.y}
                        radius={FRAME_HANDLE_RADIUS}
                        fill="#ffffff"
                        stroke={FRAME_BLUE}
                        strokeWidth={3}
                        onMouseDown={(event) => beginInteraction(event, "resize", handle)}
                        onTouchStart={(event) => beginInteraction(event, "resize", handle)}
                        onMouseEnter={() => setStageCursor(containerRef.current, interactive ? cursor : "default")}
                        onMouseLeave={() => resetStageCursor(containerRef.current, interactive)}
                      />
                    ))}
                  </>
                ) : null}
              </Layer>
            </Stage>
          </>
        ) : null}
      </div>
    </section>
  );
}

function createDefaultTransform(
  mode: StudioFrameEditorProps["editorMode"],
  sourceDimensions: StudioImageDimensions,
  targetDimensions: StudioImageDimensions,
  position: Point,
): StudioFrameTransform {
  if (mode === "outpaint") {
    return {
      kind: "outpaint",
      sourceRect: createScaledOutpaintSourceRect(
        sourceDimensions,
        targetDimensions,
        position,
      ),
    };
  }
  const crop = createAspectCropRect(
    sourceDimensions,
    targetDimensions.width / targetDimensions.height,
  );
  return {
    kind: "resize",
    cropRect: positionFrameRect(crop, position, sourceDimensions),
  };
}

function matchingTransform(
  transform: StudioFrameTransform | undefined,
  mode: StudioFrameEditorProps["editorMode"],
) {
  return transform?.kind === mode ? transform : undefined;
}

function transformRect(transform: StudioFrameTransform) {
  return transform.kind === "outpaint" ? transform.sourceRect : transform.cropRect;
}

function createTransform(
  mode: StudioFrameEditorProps["editorMode"],
  frame: FrameRect,
): StudioFrameTransform {
  return mode === "outpaint"
    ? { kind: "outpaint", sourceRect: frame }
    : { kind: "resize", cropRect: frame };
}

function frameHandlePoints(
  frame: FrameRect,
  viewport: StudioImageEditorViewport,
): HandlePoint[] {
  const left = viewport.x + frame.x * viewport.scale;
  const top = viewport.y + frame.y * viewport.scale;
  const right = left + frame.width * viewport.scale;
  const bottom = top + frame.height * viewport.scale;
  return [
    { handle: "north-west", point: { x: left, y: top }, cursor: "nwse-resize" },
    { handle: "north-east", point: { x: right, y: top }, cursor: "nesw-resize" },
    { handle: "south-east", point: { x: right, y: bottom }, cursor: "nwse-resize" },
    { handle: "south-west", point: { x: left, y: bottom }, cursor: "nesw-resize" },
  ];
}

function cropMaskRects(crop: FrameRect, bounds: StudioImageDimensions): FrameRect[] {
  const bottom = crop.y + crop.height;
  const right = crop.x + crop.width;
  return [
    { x: 0, y: 0, width: bounds.width, height: crop.y },
    { x: 0, y: bottom, width: bounds.width, height: Math.max(0, bounds.height - bottom) },
    { x: 0, y: crop.y, width: crop.x, height: crop.height },
    { x: right, y: crop.y, width: Math.max(0, bounds.width - right), height: crop.height },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}

function toViewportRect(frame: FrameRect, viewport: StudioImageEditorViewport): FrameRect {
  return {
    x: viewport.x + frame.x * viewport.scale,
    y: viewport.y + frame.y * viewport.scale,
    width: frame.width * viewport.scale,
    height: frame.height * viewport.scale,
  };
}

function viewportRectStyle(frame: FrameRect) {
  return {
    left: frame.x,
    top: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

function minimumFrameSize(
  bounds: StudioImageDimensions,
  aspectRatio: number,
  viewportScale: number,
) {
  const minimumHeight = Math.min(bounds.height, MINIMUM_HANDLE_DISTANCE / viewportScale);
  const minimumWidth = Math.min(bounds.width, minimumHeight * aspectRatio);
  return { width: minimumWidth, height: minimumHeight };
}

function fitReferenceViewport(
  stageSize: StudioImageDimensions,
  referenceSize: StudioImageDimensions,
) {
  const previewBounds = {
    width: Math.min(stageSize.width - 48, 580),
    height: Math.min(stageSize.height - 48, 386),
  };
  const fitted = fitImageEditorViewport(previewBounds, referenceSize, 0);
  return {
    x: (stageSize.width - previewBounds.width) / 2 + fitted.x,
    y: (stageSize.height - previewBounds.height) / 2 + fitted.y,
    scale: fitted.scale,
  };
}

function setStageCursor(
  container: HTMLDivElement | null,
  cursor: "default" | "grab" | "nwse-resize" | "nesw-resize",
) {
  if (container) container.style.cursor = cursor;
}

function resetStageCursor(container: HTMLDivElement | null, interactive: boolean) {
  if (container) container.style.cursor = interactive ? "grab" : "default";
}
