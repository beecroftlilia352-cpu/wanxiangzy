import type {
  StudioImageDimensions,
  StudioImageEditorDocument,
  StudioImageEditorStroke,
} from "./types";
import { assertSafeStudioImageDimensions } from "./types";

export async function exportImageEditorMask(
  document: StudioImageEditorDocument,
  dimensions: StudioImageDimensions,
  filename: string,
): Promise<File> {
  assertSafeStudioImageDimensions(dimensions);
  if (!document.strokes.some(isAdditiveMaskStroke)) throw new Error("请先标记需要修改的区域");
  const canvas = documentCanvas(dimensions);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("当前浏览器无法导出蒙版");

  context.fillStyle = "#000";
  context.fillRect(0, 0, dimensions.width, dimensions.height);
  for (const stroke of document.strokes) drawMaskStroke(context, stroke, dimensions);
  if (!hasRenderedMaskCoverage(context, dimensions)) {
    throw new Error("请先标记需要修改的区域");
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("蒙版导出失败，请重试"));
    }, "image/png");
  });
  const safeName = filename.replace(/\.[^.]+$/, "").trim() || "image";
  return new File([blob], `${safeName}-mask.png`, { type: "image/png" });
}

export function hasMaskPixelCoverage(pixels: Uint8Array | Uint8ClampedArray) {
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] >= 128) return true;
  }
  return false;
}

export function hasImageEditorToolStrokes(
  document: StudioImageEditorDocument,
  tool: StudioImageEditorStroke["tool"],
) {
  return document.strokes.some((stroke) => stroke.tool === tool && stroke.points.length >= 2);
}

export async function exportImageEditorOperationMask(
  document: StudioImageEditorDocument,
  tool: StudioImageEditorStroke["tool"],
  dimensions: StudioImageDimensions,
  filename: string,
) {
  const strokes = document.strokes
    .filter((stroke) => stroke.tool === tool)
    .map((stroke) => ({ ...stroke, tool: "brush" as const }));
  if (!strokes.length) {
    throw new Error(tool === "brush" ? "请先涂抹需要补回的区域" : "请先涂抹需要移除的区域");
  }
  return exportImageEditorMask({ version: 1, strokes }, dimensions, filename);
}

export function hasVisibleMaskContent(document: StudioImageEditorDocument) {
  const gridSize = 32;
  const occupancy = new Uint8Array(gridSize * gridSize);
  for (const stroke of document.strokes) {
    if (stroke.points.length < 2) continue;
    const value = stroke.tool === "eraser" ? 0 : 1;
    if (stroke.tool === "rectangle" || stroke.tool === "ellipse") {
      stampShapeCoverage(occupancy, gridSize, stroke, value);
      continue;
    }
    const radius = Math.max(1, Math.ceil(stroke.size * gridSize / 2));
    for (let index = 0; index < stroke.points.length; index += 2) {
      const x = stroke.points[index];
      const y = stroke.points[index + 1];
      const previousX = index >= 2 ? stroke.points[index - 2] : x;
      const previousY = index >= 2 ? stroke.points[index - 1] : y;
      const steps = Math.max(1, Math.ceil(
        Math.max(Math.abs(x - previousX), Math.abs(y - previousY)) * gridSize * 2,
      ));
      for (let step = 0; step <= steps; step += 1) {
        const progress = step / steps;
        stampCoverage(
          occupancy,
          gridSize,
          previousX + (x - previousX) * progress,
          previousY + (y - previousY) * progress,
          radius,
          value,
        );
      }
    }
  }
  return occupancy.includes(1);
}

function stampShapeCoverage(
  occupancy: Uint8Array,
  gridSize: number,
  stroke: StudioImageEditorStroke,
  value: number,
) {
  if (stroke.points.length < 4) return;
  if (stroke.points[0] === stroke.points[2] || stroke.points[1] === stroke.points[3]) return;
  const left = Math.max(0, Math.floor(Math.min(stroke.points[0], stroke.points[2]) * gridSize));
  const right = Math.min(gridSize - 1, Math.ceil(Math.max(stroke.points[0], stroke.points[2]) * gridSize));
  const top = Math.max(0, Math.floor(Math.min(stroke.points[1], stroke.points[3]) * gridSize));
  const bottom = Math.min(gridSize - 1, Math.ceil(Math.max(stroke.points[1], stroke.points[3]) * gridSize));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const radiusX = Math.max(0.5, (right - left) / 2);
  const radiusY = Math.max(0.5, (bottom - top) / 2);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const inside = stroke.tool === "rectangle"
        || ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1;
      if (inside) occupancy[y * gridSize + x] = value;
    }
  }
}

function stampCoverage(
  occupancy: Uint8Array,
  gridSize: number,
  normalizedX: number,
  normalizedY: number,
  radius: number,
  value: number,
) {
  const centerX = Math.round(normalizedX * (gridSize - 1));
  const centerY = Math.round(normalizedY * (gridSize - 1));
  for (let y = Math.max(0, centerY - radius); y <= Math.min(gridSize - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(gridSize - 1, centerX + radius); x += 1) {
      if (Math.hypot(x - centerX, y - centerY) <= radius) occupancy[y * gridSize + x] = value;
    }
  }
}

function documentCanvas(dimensions: StudioImageDimensions) {
  const canvas = window.document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  return canvas;
}

function hasRenderedMaskCoverage(
  context: CanvasRenderingContext2D,
  dimensions: StudioImageDimensions,
) {
  const maxPixelsPerChunk = 1_000_000;
  const rowsPerChunk = Math.max(1, Math.floor(maxPixelsPerChunk / dimensions.width));
  for (let y = 0; y < dimensions.height; y += rowsPerChunk) {
    const height = Math.min(rowsPerChunk, dimensions.height - y);
    const pixels = context.getImageData(0, y, dimensions.width, height).data;
    if (hasMaskPixelCoverage(pixels)) return true;
  }
  return false;
}

function drawMaskStroke(
  context: CanvasRenderingContext2D,
  stroke: StudioImageEditorStroke,
  dimensions: StudioImageDimensions,
) {
  if (stroke.points.length < 2) return;
  if ((stroke.tool === "rectangle" || stroke.tool === "ellipse") && stroke.points.length >= 4) {
    const firstX = stroke.points[0] * dimensions.width;
    const firstY = stroke.points[1] * dimensions.height;
    const secondX = stroke.points[2] * dimensions.width;
    const secondY = stroke.points[3] * dimensions.height;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#fff";
    if (stroke.tool === "rectangle") {
      context.fillRect(
        Math.min(firstX, secondX),
        Math.min(firstY, secondY),
        Math.abs(secondX - firstX),
        Math.abs(secondY - firstY),
      );
    } else {
      context.beginPath();
      context.ellipse(
        (firstX + secondX) / 2,
        (firstY + secondY) / 2,
        Math.abs(secondX - firstX) / 2,
        Math.abs(secondY - firstY) / 2,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
    return;
  }
  const diameter = Math.max(1, stroke.size * Math.min(dimensions.width, dimensions.height));
  context.save();
  // Preview erasers use destination-out, but exported masks are opaque binary PNGs.
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = stroke.tool === "brush" ? "#fff" : "#000";
  context.fillStyle = stroke.tool === "brush" ? "#fff" : "#000";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = diameter;
  const firstX = stroke.points[0] * dimensions.width;
  const firstY = stroke.points[1] * dimensions.height;
  context.beginPath();
  context.arc(firstX, firstY, diameter / 2, 0, Math.PI * 2);
  context.fill();
  if (stroke.points.length >= 4) {
    context.beginPath();
    context.moveTo(firstX, firstY);
    for (let index = 2; index < stroke.points.length; index += 2) {
      context.lineTo(stroke.points[index] * dimensions.width, stroke.points[index + 1] * dimensions.height);
    }
    context.stroke();
  }
  context.restore();
}

function isAdditiveMaskStroke(stroke: StudioImageEditorStroke) {
  if (stroke.tool === "eraser") return false;
  if (stroke.tool === "rectangle" || stroke.tool === "ellipse") {
    return stroke.points.length >= 4
      && stroke.points[0] !== stroke.points[2]
      && stroke.points[1] !== stroke.points[3];
  }
  return stroke.points.length >= 2;
}
