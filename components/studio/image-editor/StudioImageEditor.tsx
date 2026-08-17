"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { StudioImageDimensions, StudioImageEditorSession } from "./types";
import type {
  StudioImageEditorSelectionAction,
  StudioImageEditorToolbarVariant,
} from "./toolbar-variants";
import styles from "./studio-image-editor.module.css";

const StudioImageEditorClient = dynamic(
  () => import("./StudioImageEditorClient").then((module) => module.StudioImageEditorClient),
  {
    ssr: false,
    loading: () => <div className={styles.loadingFallback}>正在加载专业编辑器…</div>,
  },
);

export type StudioImageEditorProps = {
  sourceId: string;
  sourceUrl: string;
  sourceName: string;
  intent?: "inpaint" | "matting";
  /** Transparent segmentation result shown over a dimmed source while refining. */
  foregroundUrl?: string;
  /** Semantic alias for the base transparent foreground used by matting refinement. */
  baseForegroundUrl?: string;
  /** Optional matte whose transparency channel further constrains the base foreground. */
  baseAlphaUrl?: string;
  session: StudioImageEditorSession;
  disabled?: boolean;
  presentation?: "inline" | "dialog";
  showSelectionPreview?: boolean;
  toolbarActions?: ReactNode;
  /** Defaults to `erase`, or `matting` when intent is matting. */
  toolbarVariant?: StudioImageEditorToolbarVariant;
  activeSelectionAction?: StudioImageEditorSelectionAction | null;
  onSelectionAction?: (
    action: StudioImageEditorSelectionAction,
    session: StudioImageEditorSession,
  ) => StudioImageEditorSession | null | void | Promise<StudioImageEditorSession | null | void>;
  selectionActionUnavailableReason?: string;
  onSelectionActionPendingChange?: (pending: boolean) => void;
  onSessionChange: (session: StudioImageEditorSession) => void;
  onImageDimensions?: (dimensions: StudioImageDimensions) => void;
};

export function StudioImageEditor(props: StudioImageEditorProps) {
  return <StudioImageEditorClient {...props} />;
}

export type {
  StudioImageDimensions,
  StudioImageEditorDocument,
  StudioImageEditorSession,
  StudioImageEditorStroke,
  StudioImageEditorTool,
} from "./types";
export type {
  StudioImageEditorSelectionAction,
  StudioImageEditorToolbarConfig,
  StudioImageEditorToolbarVariant,
} from "./toolbar-variants";
export {
  getStudioImageEditorToolbarConfig,
  resolveStudioImageEditorToolbarVariant,
} from "./toolbar-variants";
export {
  assertSafeStudioImageDimensions,
  createImageEditorSession,
  commitImageEditorDocument,
  isDrawableStudioImageEditorStroke,
  redoImageEditorDocument,
  STUDIO_EDITOR_MAX_EDGE,
  STUDIO_EDITOR_MAX_PIXELS,
  undoImageEditorDocument,
} from "./types";
export {
  exportImageEditorMask,
  exportImageEditorOperationMask,
  hasImageEditorToolStrokes,
  hasVisibleMaskContent,
} from "./mask-export";
