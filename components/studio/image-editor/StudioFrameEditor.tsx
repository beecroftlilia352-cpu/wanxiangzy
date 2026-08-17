"use client";

import dynamic from "next/dynamic";
import type { Point } from "./geometry";
import type { FrameFitMode, FrameRect, OutpaintAnchor } from "./frame-geometry";
import type { StudioImageDimensions } from "./types";
import styles from "./studio-frame-editor.module.css";

const StudioFrameEditorClient = dynamic(
  () => import("./StudioFrameEditorClient").then((module) => module.StudioFrameEditorClient),
  {
    ssr: false,
    loading: () => <div className={styles.loading}>正在加载画布编辑器…</div>,
  },
);

export type StudioFrameEditorView = "preview" | "detail";

export type StudioFrameTransform =
  | Readonly<{ kind: "outpaint"; sourceRect: FrameRect }>
  | Readonly<{ kind: "resize"; cropRect: FrameRect }>;

export type StudioFrameEditorProps = {
  sourceId: string;
  sourceUrl: string;
  sourceName: string;
  sourceDimensions: StudioImageDimensions;
  targetDimensions: StudioImageDimensions;
  editorMode: "outpaint" | "resize";
  /** @deprecated Kept for request compatibility; the reference resize editor always uses a crop frame. */
  fitMode?: FrameFitMode;
  anchor?: OutpaintAnchor;
  cropPosition?: Point;
  /** @deprecated Kept for request compatibility; crop editing does not synthesize letterbox fill. */
  backgroundColor?: string;
  disabled?: boolean;
  /**
   * Controlled canonical geometry. Outpaint source rectangles use target/output
   * coordinates; resize crop rectangles use source-image coordinates.
   */
  transform?: StudioFrameTransform;
  defaultTransform?: StudioFrameTransform;
  view?: StudioFrameEditorView;
  onTransformChange?: (transform: StudioFrameTransform) => void;
  onRequestViewChange?: (view: StudioFrameEditorView) => void;
  onCropPositionChange?: (position: Point) => void;
};

export function StudioFrameEditor(props: StudioFrameEditorProps) {
  return <StudioFrameEditorClient {...props} />;
}

export type { FrameFitMode, FrameRect, OutpaintAnchor } from "./frame-geometry";
