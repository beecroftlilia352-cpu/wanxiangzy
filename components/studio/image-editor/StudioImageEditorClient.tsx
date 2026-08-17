"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  Circle as CircleIcon,
  Eraser,
  Hand,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  ScanSearch,
  Square,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import "konva/lib/shapes/Image";
import "konva/lib/shapes/Ellipse";
import "konva/lib/shapes/Line";
import "konva/lib/shapes/Rect";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Ellipse,
  Rect,
  Stage,
} from "react-konva/lib/ReactKonvaCore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clamp,
  fitImageEditorViewport,
  viewportPointToNormalizedImagePoint,
  zoomImageEditorViewportAtPoint,
  type Point,
  type StudioImageEditorViewport,
} from "./geometry";
import { readTrackedTouchPair, type TrackedTouchIds } from "./gesture";
import { resolveMattingPreviewBase } from "./matting-preview";
import {
  getStudioImageEditorToolbarConfig,
  resolveStudioImageEditorToolbarVariant,
  type StudioImageEditorSelectionAction,
} from "./toolbar-variants";
import type { StudioImageEditorProps } from "./StudioImageEditor";
import {
  commitImageEditorDocument,
  EMPTY_IMAGE_EDITOR_DOCUMENT,
  redoImageEditorDocument,
  assertSafeStudioImageDimensions,
  isDrawableStudioImageEditorStroke,
  undoImageEditorDocument,
  type StudioImageDimensions,
  type StudioImageEditorStroke,
  type StudioImageEditorTool,
} from "./types";
import styles from "./studio-image-editor.module.css";

const DEFAULT_STAGE_SIZE = { width: 720, height: 560 };
const MAX_STROKE_COORDINATES = 20_000;

export function StudioImageEditorClient({
  sourceId,
  sourceUrl,
  sourceName,
  intent = "inpaint",
  foregroundUrl,
  baseForegroundUrl,
  baseAlphaUrl,
  session,
  disabled = false,
  presentation = "inline",
  showSelectionPreview = false,
  toolbarActions,
  toolbarVariant,
  activeSelectionAction,
  onSelectionAction,
  selectionActionUnavailableReason,
  onSelectionActionPendingChange,
  onSessionChange,
  onImageDimensions,
}: StudioImageEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const draftLineRef = useRef<Konva.Line | null>(null);
  const selectionDraftLineRef = useRef<Konva.Line | null>(null);
  const onImageDimensionsRef = useRef(onImageDimensions);
  const onSelectionActionPendingChangeRef = useRef(onSelectionActionPendingChange);
  const activeStrokeRef = useRef<StudioImageEditorStroke | null>(null);
  const activePanRef = useRef<{ pointer: Point; viewport: StudioImageEditorViewport } | null>(null);
  const activePinchRef = useRef<{
    center: Point;
    distance: number;
    viewport: StudioImageEditorViewport;
    touchIds: readonly [number, number];
  } | null>(null);
  const fittedSourceRef = useRef("");
  const spaceHeldRef = useRef(false);
  const selectionActionRequestRef = useRef(0);
  const [stageSize, setStageSize] = useState<StudioImageDimensions>(DEFAULT_STAGE_SIZE);
  const [imageState, setImageState] = useState<{
    image: HTMLImageElement | null;
    dimensions: StudioImageDimensions;
    error: string | null;
  }>({ image: null, dimensions: { width: 1, height: 1 }, error: null });
  const [foregroundImage, setForegroundImage] = useState<HTMLImageElement | null>(null);
  const [baseAlphaImage, setBaseAlphaImage] = useState<HTMLImageElement | null>(null);
  const [viewport, setViewport] = useState<StudioImageEditorViewport>({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<StudioImageEditorTool>("brush");
  const [brushSize, setBrushSize] = useState(40);
  const [draftStroke, setDraftStroke] = useState<StudioImageEditorStroke | null>(null);
  const [selectionActionPending, setSelectionActionPending] = useState(false);
  const resolvedToolbarVariant = resolveStudioImageEditorToolbarVariant(toolbarVariant, intent);
  const toolbarConfig = getStudioImageEditorToolbarConfig(resolvedToolbarVariant);
  const resolvedForegroundUrl = baseForegroundUrl ?? foregroundUrl;
  const mattingPreviewBase = resolveMattingPreviewBase({
    source: imageState.image,
    foreground: foregroundImage,
    alpha: baseAlphaImage,
  });
  const mattingBaseImage = mattingPreviewBase.baseImage;
  const editorDisabled = disabled || selectionActionPending;

  const fitViewport = useMemo(
    () => fitImageEditorViewport(stageSize, imageState.dimensions),
    [imageState.dimensions, stageSize],
  );
  const minScale = Math.max(0.01, fitViewport.scale * 0.25);
  const maxScale = Math.max(minScale, fitViewport.scale * 16);

  useEffect(() => {
    onImageDimensionsRef.current = onImageDimensions;
  }, [onImageDimensions]);

  useEffect(() => {
    onSelectionActionPendingChangeRef.current = onSelectionActionPendingChange;
  }, [onSelectionActionPendingChange]);

  useEffect(() => {
    onSelectionActionPendingChangeRef.current?.(selectionActionPending);
  }, [selectionActionPending]);

  useEffect(() => () => {
    selectionActionRequestRef.current += 1;
    onSelectionActionPendingChangeRef.current?.(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setStageSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setImageState((current) => ({ ...current, image: null, error: null }));
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const dimensions = {
        width: Math.max(1, image.naturalWidth),
        height: Math.max(1, image.naturalHeight),
      };
      try {
        assertSafeStudioImageDimensions(dimensions);
      } catch (error) {
        setImageState({
          image: null,
          dimensions: { width: 1, height: 1 },
          error: error instanceof Error ? error.message : "原图尺寸超出局部编辑限制",
        });
        return;
      }
      setImageState({ image, dimensions, error: null });
      onImageDimensionsRef.current?.(dimensions);
    };
    image.onerror = () => {
      if (cancelled) return;
      setImageState({
        image: null,
        dimensions: { width: 1, height: 1 },
        error: "规范化原图加载失败，请移除后重新上传",
      });
    };
    image.src = sourceUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!resolvedForegroundUrl) {
      setForegroundImage(null);
      return;
    }
    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setForegroundImage(image);
    };
    image.onerror = () => {
      if (!cancelled) setForegroundImage(null);
    };
    image.src = resolvedForegroundUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [resolvedForegroundUrl]);

  useEffect(() => {
    if (!baseAlphaUrl) {
      setBaseAlphaImage(null);
      return;
    }
    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setBaseAlphaImage(image);
    };
    image.onerror = () => {
      if (!cancelled) setBaseAlphaImage(null);
    };
    image.src = baseAlphaUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [baseAlphaUrl]);

  useEffect(() => {
    if (!imageState.image) return;
    if (fittedSourceRef.current === sourceId) return;
    fittedSourceRef.current = sourceId;
    setViewport(fitViewport);
  }, [fitViewport, imageState.image, sourceId]);

  useEffect(() => {
    if (presentation !== "dialog" || disabled) return;
    containerRef.current?.focus({ preventScroll: true });
  }, [disabled, presentation, sourceId]);

  useEffect(() => {
    if (!toolbarConfig.showShapes && (tool === "ellipse" || tool === "rectangle")) {
      setTool("brush");
    }
  }, [tool, toolbarConfig.showShapes]);

  const changeTool = (nextTool: StudioImageEditorTool) => {
    if (editorDisabled) return;
    setTool(nextTool);
    containerRef.current?.focus();
  };

  const triggerSelectionAction = async (action: StudioImageEditorSelectionAction) => {
    if (editorDisabled) return;
    if (action === "add" || action === "subtract") {
      changeTool(action === "add" ? "brush" : "eraser");
      return;
    }
    if (!onSelectionAction) return;
    const requestId = selectionActionRequestRef.current + 1;
    selectionActionRequestRef.current = requestId;
    setSelectionActionPending(true);
    try {
      const nextSession = await onSelectionAction(action, session);
      if (selectionActionRequestRef.current === requestId && nextSession) {
        onSessionChange(nextSession);
      }
    } finally {
      if (selectionActionRequestRef.current === requestId) {
        setSelectionActionPending(false);
        containerRef.current?.focus();
      }
    }
  };

  const commitStroke = useCallback((stroke: StudioImageEditorStroke) => {
    if (!isDrawableStudioImageEditorStroke(stroke, imageState.dimensions)) return;
    onSessionChange(commitImageEditorDocument(session, {
      version: 1,
      strokes: [...session.present.strokes, stroke],
    }));
  }, [imageState.dimensions, onSessionChange, session]);

  const pointerPosition = () => stageRef.current?.getPointerPosition() || null;

  const beginInteraction = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (editorDisabled || !imageState.image) return;
    if ("touches" in event.evt && event.evt.touches.length >= 2) {
      event.evt.preventDefault();
      // Keep the original pinch pair stable when a third finger lands.
      if (activePinchRef.current) return;
      const gesture = readPinchGesture(event.evt, stageRef.current);
      if (!gesture) return;
      activeStrokeRef.current = null;
      setDraftStroke(null);
      activePanRef.current = null;
      activePinchRef.current = { ...gesture, viewport };
      return;
    }
    if ("touches" in event.evt && activePinchRef.current) return;
    if ("button" in event.evt && event.evt.button !== 0) return;
    const pointer = pointerPosition();
    if (!pointer) return;
    containerRef.current?.focus();
    if (tool === "pan" || spaceHeldRef.current) {
      activePanRef.current = { pointer, viewport };
      return;
    }
    const point = viewportPointToNormalizedImagePoint(pointer, viewport, imageState.dimensions);
    if (!point) return;
    const stroke: StudioImageEditorStroke = {
      id: createStrokeId(),
      tool,
      size: brushSize / Math.max(1, Math.min(imageState.dimensions.width, imageState.dimensions.height)),
      points: [point.x, point.y, point.x, point.y],
    };
    activeStrokeRef.current = stroke;
    setDraftStroke(stroke);
  };

  const continueInteraction = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (editorDisabled) return;
    if (activePinchRef.current && "touches" in event.evt) {
      const gesture = readPinchGesture(
        event.evt,
        stageRef.current,
        activePinchRef.current.touchIds,
      );
      if (!gesture) return;
      event.evt.preventDefault();
      const active = activePinchRef.current;
      const scale = clamp(
        active.viewport.scale * gesture.distance / Math.max(1, active.distance),
        minScale,
        maxScale,
      );
      const imagePoint = {
        x: (active.center.x - active.viewport.x) / active.viewport.scale,
        y: (active.center.y - active.viewport.y) / active.viewport.scale,
      };
      setViewport({
        x: gesture.center.x - imagePoint.x * scale,
        y: gesture.center.y - imagePoint.y * scale,
        scale,
      });
      return;
    }
    const pointer = pointerPosition();
    if (!pointer) return;
    if (activePanRef.current) {
      const active = activePanRef.current;
      setViewport({
        ...active.viewport,
        x: active.viewport.x + pointer.x - active.pointer.x,
        y: active.viewport.y + pointer.y - active.pointer.y,
      });
      return;
    }
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const point = viewportPointToNormalizedImagePoint(pointer, viewport, imageState.dimensions);
    if (!point) return;
    if (stroke.tool === "rectangle" || stroke.tool === "ellipse") {
      stroke.points[2] = point.x;
      stroke.points[3] = point.y;
      setDraftStroke({ ...stroke, points: [...stroke.points] });
      return;
    }
    const previousX = stroke.points.at(-2) ?? point.x;
    const previousY = stroke.points.at(-1) ?? point.y;
    if (Math.hypot(point.x - previousX, point.y - previousY) < 0.001) return;
    if (stroke.points.length >= MAX_STROKE_COORDINATES) return;
    stroke.points.push(point.x, point.y);
    const draftLine = draftLineRef.current;
    const selectionDraftLine = selectionDraftLineRef.current;
    if (draftLine || selectionDraftLine) {
      // Konva reads the mutable points attribute during the next batched draw.
      // Appending two numbers is O(1) and avoids copying the full stroke on every move.
      const imageX = point.x * imageState.dimensions.width;
      const imageY = point.y * imageState.dimensions.height;
      draftLine?.points().push(imageX, imageY);
      selectionDraftLine?.points().push(imageX, imageY);
      draftLine?.getLayer()?.batchDraw();
      selectionDraftLine?.getLayer()?.batchDraw();
    }
  };

  const endInteraction = () => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePanRef.current = null;
    activePinchRef.current = null;
    setDraftStroke(null);
    if (stroke) commitStroke({ ...stroke, points: [...stroke.points] });
  };

  const endTouchInteraction = (event: KonvaEventObject<TouchEvent>) => {
    const activePinch = activePinchRef.current;
    if (activePinch) {
      const trackedTouches = readTrackedTouchPair(event.evt.touches, activePinch.touchIds);
      // An unrelated third touch ended; the original pinch pair is still valid.
      if (trackedTouches) return;
    }
    endInteraction();
  };

  const setZoom = useCallback((scale: number, point?: Point) => {
    const pointer = point || { x: stageSize.width / 2, y: stageSize.height / 2 };
    setViewport((current) => zoomImageEditorViewportAtPoint(
      current,
      pointer,
      clamp(scale, minScale, maxScale),
    ));
  }, [maxScale, minScale, stageSize.height, stageSize.width]);

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    if (editorDisabled) return;
    if (event.evt.ctrlKey || event.evt.metaKey) {
      const direction = event.evt.deltaY > 0 ? -1 : 1;
      setBrushSize((current) => clamp(current + direction * 2, 4, 200));
      return;
    }
    const pointer = pointerPosition();
    if (!pointer) return;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.12 : 1 / 1.12;
    setViewport((current) => zoomImageEditorViewportAtPoint(
      current,
      pointer,
      clamp(current.scale * factor, minScale, maxScale),
    ));
  };

  const undo = useCallback(() => {
    if (editorDisabled || !session.past.length) return;
    onSessionChange(undoImageEditorDocument(session));
  }, [editorDisabled, onSessionChange, session]);

  const redo = useCallback(() => {
    if (editorDisabled || !session.future.length) return;
    onSessionChange(redoImageEditorDocument(session));
  }, [editorDisabled, onSessionChange, session]);

  const clear = useCallback(() => {
    if (editorDisabled || !session.present.strokes.length) return;
    onSessionChange(commitImageEditorDocument(session, EMPTY_IMAGE_EDITOR_DOCUMENT));
  }, [editorDisabled, onSessionChange, session]);

  const selectWholeImage = useCallback(() => {
    if (editorDisabled || !imageState.image) return;
    const minDimension = Math.max(1, Math.min(imageState.dimensions.width, imageState.dimensions.height));
    const stroke: StudioImageEditorStroke = {
      id: createStrokeId(),
      tool: "brush",
      size: Math.hypot(imageState.dimensions.width, imageState.dimensions.height) / minDimension * 1.01,
      points: [0.5, 0.5, 0.50001, 0.5],
    };
    commitStroke(stroke);
  }, [commitStroke, editorDisabled, imageState.dimensions.height, imageState.dimensions.width, imageState.image]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.code === "Space") {
      event.preventDefault();
      spaceHeldRef.current = true;
      return;
    }
    if (toolbarConfig.showBrush && key === "b") changeTool("brush");
    if (toolbarConfig.showEraser && key === "e") changeTool("eraser");
    if (toolbarConfig.showShapes && key === "o") changeTool("ellipse");
    if (toolbarConfig.showShapes && key === "r") changeTool("rectangle");
    if (key === "a") {
      event.preventDefault();
      selectWholeImage();
    }
    if (key === "0") setViewport(fitViewport);
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.code === "Space") spaceHeldRef.current = false;
  };

  return (
    <section
      className={styles.editor}
      data-presentation={presentation}
      aria-label={intent === "matting" ? "抠图边缘细化编辑器" : "局部蒙版编辑器"}
    >
      <div className={styles.toolbar}>
        {toolbarConfig.selectionActions.length ? (
          <div className={styles.toolGroup} role="group" aria-label="自动选区工具">
          {toolbarConfig.selectionActions.map((action) => (
            <SelectionActionButton
              key={action}
              action={action}
              active={activeSelectionAction === action
                || (action === "add" && tool === "brush")
                || (action === "subtract" && tool === "eraser")}
              disabled={editorDisabled || ((action === "smart" || action === "auto") && !onSelectionAction)}
              disabledReason={(action === "smart" || action === "auto") && !onSelectionAction
                ? selectionActionUnavailableReason
                : undefined}
              onClick={() => { void triggerSelectionAction(action); }}
            />
          ))}
          </div>
        ) : null}
        <strong className={styles.toolbarTitle}>手动调整</strong>
        <div className={styles.toolGroup} role="group" aria-label="手动选区工具">
          {toolbarConfig.showBrush ? (
            <EditorToolButton icon={<Brush />} label="涂抹" active={tool === "brush"} disabled={editorDisabled} onClick={() => changeTool("brush")} />
          ) : null}
          {toolbarConfig.showEraser ? (
            <EditorToolButton icon={<Eraser />} label="擦除" active={tool === "eraser"} disabled={editorDisabled} onClick={() => changeTool("eraser")} />
          ) : null}
        </div>
        <label className={styles.brushSize}>
          <input
            type="range"
            min="4"
            max="200"
            step="2"
            value={brushSize}
            disabled={editorDisabled || (tool !== "brush" && tool !== "eraser")}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            aria-label="画笔像素大小"
          />
        </label>
        <div className={styles.toolGroup} role="group" aria-label="形状、历史与视图">
          {toolbarConfig.showShapes ? (
            <>
              <EditorToolButton icon={<CircleIcon />} label="圈选" active={tool === "ellipse"} disabled={editorDisabled} onClick={() => changeTool("ellipse")} />
              <EditorToolButton icon={<Square />} label="框选" active={tool === "rectangle"} disabled={editorDisabled} onClick={() => changeTool("rectangle")} />
            </>
          ) : null}
          <Button type="button" size="icon-sm" variant="ghost" onClick={clear} disabled={editorDisabled || !session.present.strokes.length} aria-label="重置选区">
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={undo} disabled={editorDisabled || !session.past.length} aria-label="上一步">
            <Undo2 aria-hidden="true" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={redo} disabled={editorDisabled || !session.future.length} aria-label="下一步">
            <Redo2 aria-hidden="true" />
          </Button>
          <EditorToolButton icon={<Hand />} label="拖拽画布" active={tool === "pan"} disabled={editorDisabled} onClick={() => changeTool("pan")} iconOnly />
          <span className={styles.divider} aria-hidden="true" />
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setZoom(viewport.scale / 1.2)} disabled={editorDisabled} aria-label="缩小">
            <ZoomOut aria-hidden="true" />
          </Button>
          <span className={styles.zoomValue}>{Math.round(viewport.scale * 100)}%</span>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setZoom(viewport.scale * 1.2)} disabled={editorDisabled} aria-label="放大">
            <ZoomIn aria-hidden="true" />
          </Button>
        </div>
        {toolbarActions ? <div className={styles.toolbarActions}>{toolbarActions}</div> : null}
      </div>

      <div className={styles.workspace} data-dual-view={showSelectionPreview || undefined}>
        <div className={styles.canvasColumn}>
          {showSelectionPreview ? <strong className={styles.canvasLabel}>原图</strong> : null}
          <div
            ref={containerRef}
            className={cn(styles.stage, editorDisabled && styles.disabled)}
            data-tool={tool}
            tabIndex={editorDisabled ? -1 : 0}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onBlur={() => { spaceHeldRef.current = false; }}
            onContextMenu={(event) => event.preventDefault()}
            role="region"
            aria-label="在原图上标记允许 AI 修改的区域"
            aria-keyshortcuts={toolbarConfig.showShapes
              ? "A B E O R Space 0 Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z"
              : "A B E Space 0 Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z"}
            title={`正在编辑：${sourceName}`}
            aria-describedby={`studio-image-editor-help-${sourceId}`}
          >
            {imageState.error ? (
              <div className={styles.error} role="alert">{imageState.error}</div>
            ) : !imageState.image ? (
              <div className={styles.loading}>正在读取规范化原图…</div>
            ) : (
              <Stage
                ref={stageRef}
                width={stageSize.width}
                height={stageSize.height}
                onMouseDown={beginInteraction}
                onMouseMove={continueInteraction}
                onMouseUp={endInteraction}
                onMouseLeave={endInteraction}
                onTouchStart={beginInteraction}
                onTouchMove={continueInteraction}
                onTouchEnd={endTouchInteraction}
                onTouchCancel={endTouchInteraction}
                onWheel={handleWheel}
              >
                <Layer listening>
                  <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
                    <Rect width={imageState.dimensions.width} height={imageState.dimensions.height} fill="#fff" />
                    <KonvaImage
                      image={imageState.image}
                      width={imageState.dimensions.width}
                      height={imageState.dimensions.height}
                      opacity={intent === "matting" && mattingBaseImage ? 0.28 : 1}
                    />
                  </Group>
                </Layer>
                {intent === "matting" && mattingBaseImage ? (
                  <Layer listening={false}>
                    <MattingBaseGroup
                      baseImage={mattingBaseImage}
                      alphaImage={mattingPreviewBase.alphaImage}
                      dimensions={imageState.dimensions}
                      viewport={viewport}
                      selectionOverlay
                    />
                    <MaskStrokeGroup
                      strokes={session.present.strokes}
                      draftStroke={draftStroke}
                      draftLineRef={draftLineRef}
                      dimensions={imageState.dimensions}
                      viewport={viewport}
                      intent={intent}
                    />
                  </Layer>
                ) : (
                  <Layer listening={false}>
                    <MaskStrokeGroup
                      strokes={session.present.strokes}
                      draftStroke={draftStroke}
                      draftLineRef={draftLineRef}
                      dimensions={imageState.dimensions}
                      viewport={viewport}
                      intent={intent}
                    />
                  </Layer>
                )}
              </Stage>
            )}
          </div>
        </div>

        {showSelectionPreview ? (
          <div className={styles.canvasColumn} role="img" aria-label="选区图实时预览">
            <strong className={styles.canvasLabel}>选区图</strong>
            <div className={cn(styles.stage, styles.selectionStage)} aria-hidden="true">
              {imageState.image ? (
                <Stage width={stageSize.width} height={stageSize.height}>
                  <Layer listening={false}>
                    {intent === "matting" && mattingBaseImage ? (
                      <MattingBaseGroup
                        baseImage={mattingBaseImage}
                        alphaImage={mattingPreviewBase.alphaImage}
                        dimensions={imageState.dimensions}
                        viewport={viewport}
                      />
                    ) : null}
                    <MaskStrokeGroup
                      strokes={session.present.strokes}
                      draftStroke={draftStroke}
                      draftLineRef={selectionDraftLineRef}
                      dimensions={imageState.dimensions}
                      viewport={viewport}
                      intent={intent}
                      selectionPreview
                    />
                    <Group
                      x={viewport.x}
                      y={viewport.y}
                      scaleX={viewport.scale}
                      scaleY={viewport.scale}
                      clipX={0}
                      clipY={0}
                      clipWidth={imageState.dimensions.width}
                      clipHeight={imageState.dimensions.height}
                    >
                      <KonvaImage
                        image={imageState.image}
                        width={imageState.dimensions.width}
                        height={imageState.dimensions.height}
                        globalCompositeOperation="source-in"
                      />
                    </Group>
                  </Layer>
                </Stage>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <p id={`studio-image-editor-help-${sourceId}`} className={styles.help} aria-live="polite">
        {intent === "matting"
          ? "蓝色区域为当前选区；增加或涂抹可补回，减少或擦除可移出。滚轮缩放画布，Ctrl/⌘ + Z 上一步。"
          : "浅蓝区域允许 AI 修改。滚轮缩放画布，按住空格并拖拽可移动画布。"}
      </p>
    </section>
  );
}

function EditorToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  iconOnly = false,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  iconOnly?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={iconOnly ? label : undefined}
      title={title}
    >
      {icon}{iconOnly ? null : label}
    </Button>
  );
}

function SelectionActionButton({
  action,
  active,
  disabled,
  disabledReason,
  onClick,
}: {
  action: StudioImageEditorSelectionAction;
  active: boolean;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  const descriptor = {
    smart: { icon: <WandSparkles />, label: "智能抠图" },
    auto: { icon: <ScanSearch />, label: "自动选区" },
    add: { icon: <Plus />, label: "增加" },
    subtract: { icon: <Minus />, label: "减少" },
  }[action];
  return (
    <EditorToolButton
      icon={descriptor.icon}
      label={descriptor.label}
      active={active}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onClick}
    />
  );
}

function MattingBaseGroup({
  baseImage,
  alphaImage,
  dimensions,
  viewport,
  selectionOverlay = false,
}: {
  baseImage: CanvasImageSource;
  alphaImage: CanvasImageSource | null;
  dimensions: StudioImageDimensions;
  viewport: StudioImageEditorViewport;
  selectionOverlay?: boolean;
}) {
  return (
    <Group
      x={viewport.x}
      y={viewport.y}
      scaleX={viewport.scale}
      scaleY={viewport.scale}
      clipX={0}
      clipY={0}
      clipWidth={dimensions.width}
      clipHeight={dimensions.height}
    >
      <KonvaImage image={baseImage} width={dimensions.width} height={dimensions.height} />
      {alphaImage ? (
        <KonvaImage
          image={alphaImage}
          width={dimensions.width}
          height={dimensions.height}
          globalCompositeOperation="destination-in"
        />
      ) : null}
      {selectionOverlay ? (
        <Rect
          width={dimensions.width}
          height={dimensions.height}
          fill="rgba(46, 125, 246, 0.58)"
          globalCompositeOperation="source-in"
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function MaskStrokeGroup({
  strokes,
  draftStroke,
  draftLineRef,
  dimensions,
  viewport,
  intent,
  selectionPreview = false,
}: {
  strokes: StudioImageEditorStroke[];
  draftStroke: StudioImageEditorStroke | null;
  draftLineRef: React.RefObject<Konva.Line | null>;
  dimensions: StudioImageDimensions;
  viewport: StudioImageEditorViewport;
  intent: "inpaint" | "matting";
  selectionPreview?: boolean;
}) {
  return (
    <Group
      x={viewport.x}
      y={viewport.y}
      scaleX={viewport.scale}
      scaleY={viewport.scale}
      clipX={0}
      clipY={0}
      clipWidth={dimensions.width}
      clipHeight={dimensions.height}
    >
      {strokes.map((stroke) => (
        <EditorStrokeNode
          key={stroke.id}
          stroke={stroke}
          dimensions={dimensions}
          intent={intent}
          selectionPreview={selectionPreview}
        />
      ))}
      {draftStroke ? (
        <EditorStrokeNode
          stroke={draftStroke}
          dimensions={dimensions}
          intent={intent}
          selectionPreview={selectionPreview}
          lineRef={draftLineRef}
        />
      ) : null}
    </Group>
  );
}

function EditorStrokeNode({
  stroke,
  dimensions,
  intent,
  selectionPreview,
  lineRef,
}: {
  stroke: StudioImageEditorStroke;
  dimensions: StudioImageDimensions;
  intent: "inpaint" | "matting";
  selectionPreview: boolean;
  lineRef?: React.RefObject<Konva.Line | null>;
}) {
  const points = strokePointsToPixels(stroke, dimensions);
  const color = selectionPreview
    ? "#fff"
    : intent === "matting"
      ? "rgba(46, 125, 246, 0.58)"
      : "rgba(80, 167, 255, 0.44)";
  const compositeOperation = selectionPreview
    ? stroke.tool === "eraser" ? "destination-out" : "source-over"
    : intent === "matting"
      ? stroke.tool === "eraser" ? "destination-out" : "source-over"
      : stroke.tool === "eraser" ? "destination-out" : "source-over";

  if (stroke.tool === "rectangle") {
    const left = Math.min(points[0], points[2]);
    const top = Math.min(points[1], points[3]);
    return (
      <Rect
        x={left}
        y={top}
        width={Math.abs(points[2] - points[0])}
        height={Math.abs(points[3] - points[1])}
        fill={color}
        globalCompositeOperation={compositeOperation}
        perfectDrawEnabled={false}
      />
    );
  }
  if (stroke.tool === "ellipse") {
    return (
      <Ellipse
        x={(points[0] + points[2]) / 2}
        y={(points[1] + points[3]) / 2}
        radiusX={Math.abs(points[2] - points[0]) / 2}
        radiusY={Math.abs(points[3] - points[1]) / 2}
        fill={color}
        globalCompositeOperation={compositeOperation}
        perfectDrawEnabled={false}
      />
    );
  }
  return (
    <Line
      ref={lineRef}
      points={points}
      stroke={color}
      lineCap="round"
      lineJoin="round"
      strokeWidth={Math.max(1, stroke.size * Math.min(dimensions.width, dimensions.height))}
      globalCompositeOperation={compositeOperation}
      perfectDrawEnabled={false}
    />
  );
}

function createStrokeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function readPinchGesture(
  event: TouchEvent,
  stage: Konva.Stage | null,
  touchIds?: TrackedTouchIds,
) {
  if (!stage) return null;
  const pair = readTrackedTouchPair(event.touches, touchIds);
  if (!pair) return null;
  const rect = stage.container().getBoundingClientRect();
  const { first, second } = pair;
  const firstPoint = { x: first.clientX - rect.left, y: first.clientY - rect.top };
  const secondPoint = { x: second.clientX - rect.left, y: second.clientY - rect.top };
  return {
    center: {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2,
    },
    distance: Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y),
    touchIds: pair.touchIds,
  };
}

function strokePointsToPixels(
  stroke: StudioImageEditorStroke,
  dimensions: StudioImageDimensions,
) {
  return stroke.points.map((point, index) => (
    point * (index % 2 === 0 ? dimensions.width : dimensions.height)
  ));
}
