import { createZip } from "@/lib/zip";
import type { ProductRetouchOutput } from "@/lib/product-retouch";

const MAX_ZIP_BYTES = 500 * 1024 * 1024;

export async function downloadProductRetouchZip(input: {
  batchId: string;
  outputs: ProductRetouchOutput[];
  scopeLabel?: string;
}) {
  const completed = input.outputs.filter(
    (output): output is ProductRetouchOutput & { resultUrl: string } =>
      output.status === "completed" && Boolean(output.resultUrl),
  );
  if (!completed.length) throw new Error("当前没有可下载的成功结果");

  let totalBytes = 0;
  const files: Array<{ name: string; data: Blob }> = [];
  for (const output of completed) {
    const extension = getOutputExtension(output);
    const filename = `${sanitizeBaseName(output.sourceFilename)}-精修-${output.variantIndex}.${extension}`;
    const response = await fetch(
      `/api/download-image?url=${encodeURIComponent(output.resultUrl)}&filename=${encodeURIComponent(filename)}&proxy=1`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`${output.sourceFilename} 下载失败`);
    const blob = await response.blob();
    totalBytes += blob.size;
    if (totalBytes > MAX_ZIP_BYTES) {
      throw new Error("批次文件超过 500MB，请按商品分组下载");
    }
    files.push({ name: uniqueFilename(filename, files), data: blob });
  }

  const zip = await createZip(files);
  saveBlob(
    zip,
    `商品精修-${input.scopeLabel ? `${sanitizeBaseName(input.scopeLabel)}-` : ""}${input.batchId.slice(0, 8)}.zip`,
  );
}

function getOutputExtension(output: ProductRetouchOutput) {
  const format = output.validation?.format;
  if (format === "jpeg") return "jpg";
  if (format === "png" || format === "webp") return format;
  const match = output.resultUrl?.match(/\.(png|jpe?g|webp)(?:$|[?#])/i);
  if (!match) return "png";
  return match[1].toLowerCase().replace("jpeg", "jpg");
}

function sanitizeBaseName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .trim()
    .slice(0, 80) || "商品";
}

function uniqueFilename(
  filename: string,
  files: Array<{ name: string }>,
) {
  if (!files.some((file) => file.name === filename)) return filename;
  const dot = filename.lastIndexOf(".");
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  const extension = dot >= 0 ? filename.slice(dot) : "";
  let suffix = 2;
  while (files.some((file) => file.name === `${base}-${suffix}${extension}`)) suffix += 1;
  return `${base}-${suffix}${extension}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
