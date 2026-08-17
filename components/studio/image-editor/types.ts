export type StudioImageEditorTool = "brush" | "eraser" | "ellipse" | "rectangle" | "pan";

export type StudioImageEditorStrokeTool = Exclude<StudioImageEditorTool, "pan">;

/**
 * Points and brush size are normalized against the canonical source image.
 * This keeps the document independent from the current viewport and screen DPR.
 */
export type StudioImageEditorStroke = {
  id: string;
  tool: StudioImageEditorStrokeTool;
  size: number;
  points: number[];
};

export type StudioImageEditorDocument = {
  version: 1;
  strokes: StudioImageEditorStroke[];
};

export type StudioImageEditorSession = {
  past: StudioImageEditorDocument[];
  present: StudioImageEditorDocument;
  future: StudioImageEditorDocument[];
};

export type StudioImageDimensions = {
  width: number;
  height: number;
};

export const STUDIO_EDITOR_MAX_EDGE = 8_192;
export const STUDIO_EDITOR_MAX_PIXELS = 32_000_000;

export const EMPTY_IMAGE_EDITOR_DOCUMENT: StudioImageEditorDocument = {
  version: 1,
  strokes: [],
};

export function createImageEditorSession(
  document: StudioImageEditorDocument = EMPTY_IMAGE_EDITOR_DOCUMENT,
): StudioImageEditorSession {
  return {
    past: [],
    present: copyImageEditorDocument(document),
    future: [],
  };
}

export function commitImageEditorDocument(
  session: StudioImageEditorSession,
  document: StudioImageEditorDocument,
  historyLimit = 50,
): StudioImageEditorSession {
  if (sameImageEditorDocument(session.present, document)) return session;
  return {
    past: [...session.past, session.present].slice(-historyLimit),
    present: copyImageEditorDocument(document),
    future: [],
  };
}

export function undoImageEditorDocument(session: StudioImageEditorSession): StudioImageEditorSession {
  const previous = session.past.at(-1);
  if (!previous) return session;
  return {
    past: session.past.slice(0, -1),
    present: previous,
    future: [session.present, ...session.future],
  };
}

export function redoImageEditorDocument(session: StudioImageEditorSession): StudioImageEditorSession {
  const [next, ...future] = session.future;
  if (!next) return session;
  return {
    past: [...session.past, session.present],
    present: next,
    future,
  };
}

export function copyImageEditorDocument(document: StudioImageEditorDocument): StudioImageEditorDocument {
  return {
    version: 1,
    // Committed strokes are immutable; structural sharing keeps undo/redo cheap.
    strokes: [...document.strokes],
  };
}

export function assertSafeStudioImageDimensions(dimensions: StudioImageDimensions) {
  const { width, height } = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("原图尺寸无效，请重新上传");
  }
  if (width > STUDIO_EDITOR_MAX_EDGE || height > STUDIO_EDITOR_MAX_EDGE) {
    throw new Error(`局部编辑原图单边不能超过 ${STUDIO_EDITOR_MAX_EDGE}px`);
  }
  if (width * height > STUDIO_EDITOR_MAX_PIXELS) {
    throw new Error("局部编辑原图不能超过 3200 万像素");
  }
}

export function isDrawableStudioImageEditorStroke(
  stroke: StudioImageEditorStroke,
  dimensions: StudioImageDimensions,
) {
  if (stroke.points.length < 4) return false;
  if (stroke.tool !== "rectangle" && stroke.tool !== "ellipse") return true;
  return Math.abs(stroke.points[2] - stroke.points[0]) * dimensions.width >= 1
    && Math.abs(stroke.points[3] - stroke.points[1]) * dimensions.height >= 1;
}

function sameImageEditorDocument(
  left: StudioImageEditorDocument,
  right: StudioImageEditorDocument,
) {
  if (left.strokes.length !== right.strokes.length) return false;
  return left.strokes.every((stroke, index) => {
    const candidate = right.strokes[index];
    return candidate
      && stroke.id === candidate.id
      && stroke.tool === candidate.tool
      && stroke.size === candidate.size
      && stroke.points.length === candidate.points.length
      && stroke.points.every((point, pointIndex) => point === candidate.points[pointIndex]);
  });
}
