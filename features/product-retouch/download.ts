import { createZip } from "@/lib/zip";
import { fetchMediaBlob, saveBlobToDevice } from "@/lib/media-download";
import { generateDownloadFilename } from "@/lib/utils";
import type { ProductRetouchOutput } from "@/lib/product-retouch";

const MAX_ZIP_BYTES = 500 * 1024 * 1024;
const PREFIX = "product-retouch";

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
  for (const [index, output] of completed.entries()) {
    const extension = getOutputExtension(output);
    // Match the standard `vwg-ret-{MMDD}-{HHmm}-{seq}.{ext}` filename format used
    // by every other studio module (see lib/utils.ts generateDownloadFilename).
    const filename = generateDownloadFilename(PREFIX, index, extension);
    // ZIP needs readable bytes. Hong Kong OSS does not currently expose CORS
    // headers, so use the guarded same-origin streaming path with retry instead
    // of following a signed cross-origin redirect from fetch().
    const blob = await fetchMediaBlob(output.resultUrl, filename, { forceProxy: true });
    totalBytes += blob.size;
    if (totalBytes > MAX_ZIP_BYTES) {
      throw new Error("批次文件超过 500MB，请按商品分组下载");
    }
    files.push({ name: filename, data: blob });
  }

  const zip = await createZip(files);
  saveBlobToDevice(
    zip,
    buildZipFilename(input.batchId, input.scopeLabel, completed.length),
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

function buildZipFilename(batchId: string, scopeLabel: string | undefined, count: number) {
  const scope = scopeLabel ? `-${sanitizeBaseName(scopeLabel)}` : "";
  return `商品精修${scope}-${batchId.slice(0, 8)}-${count}pkg.zip`;
}

function sanitizeBaseName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .trim()
    .slice(0, 80) || "商品";
}
