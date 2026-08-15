import JSZip from "jszip";
import { toast } from "sonner";

/**
 * 前端批量下载：fetch 图片 -> JSZip 内存打包 -> 触发单个 zip 下载。
 * 零服务器压力（只消耗浏览器内存），适合任务结果 1-30 张场景。
 */
export const ZIP_DOWNLOAD_DEFAULT_LABEL = "图片";
export const ZIP_DOWNLOAD_DEFAULT_LABEL_KEY = "LibShared.zipDownload.defaultLabel";
export const ZIP_DOWNLOAD_NO_IMAGES = "没有可下载的图片";
export const ZIP_DOWNLOAD_NO_IMAGES_KEY = "LibShared.zipDownload.noImages";
export const ZIP_DOWNLOAD_PACKING_PREFIX = "正在打包";
export const ZIP_DOWNLOAD_PACKING_UNIT = "张";
export const ZIP_DOWNLOAD_PACKING_KEY = "LibShared.zipDownload.packing";
export const ZIP_DOWNLOAD_SINGLE_FAILED_PREFIX = "图片";
export const ZIP_DOWNLOAD_SINGLE_FAILED_SUFFIX = "下载失败";
export const ZIP_DOWNLOAD_SINGLE_FAILED_KEY = "LibShared.zipDownload.singleFailed";
export const ZIP_DOWNLOAD_SUCCESS_PREFIX = "已打包";
export const ZIP_DOWNLOAD_SUCCESS_KEY = "LibShared.zipDownload.success";
export const ZIP_DOWNLOAD_FAILED_FALLBACK = "打包失败，请重试";
export const ZIP_DOWNLOAD_FAILED_FALLBACK_KEY = "LibShared.zipDownload.failed";

export async function downloadImagesAsZip(options: {
  urls: string[];
  filename?: string;
  label?: string;
}) {
  const { urls, filename = "pixel-diffusion-batch", label = ZIP_DOWNLOAD_DEFAULT_LABEL } = options;
  const validUrls = urls.filter(Boolean);
  if (!validUrls.length) {
    toast.error(ZIP_DOWNLOAD_NO_IMAGES);
    return;
  }
  const toastId = toast.loading(`${ZIP_DOWNLOAD_PACKING_PREFIX} ${validUrls.length} ${ZIP_DOWNLOAD_PACKING_UNIT}${label}…`);

  try {
    const zip = new JSZip();
    const folder = zip.folder(filename) || zip;
    await Promise.all(
      validUrls.map(async (url, index) => {
        // 走同源代理下载：绕开 OSS 跨域 CORS 限制，保证批量打包可靠
        const proxyUrl = `/api/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${index + 1}`)}&proxy=1`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`${ZIP_DOWNLOAD_SINGLE_FAILED_PREFIX} ${index + 1} ${ZIP_DOWNLOAD_SINGLE_FAILED_SUFFIX}`);
        const blob = await res.blob();
        const ext = inferImageExtension(url, blob.type);
        folder.file(`${String(index + 1).padStart(2, "0")}.${ext}`, blob);
      }),
    );
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerDownload(zipBlob, `${filename}.zip`);
    toast.success(`${ZIP_DOWNLOAD_SUCCESS_PREFIX} ${validUrls.length} ${ZIP_DOWNLOAD_PACKING_UNIT}${label}`, { id: toastId });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : ZIP_DOWNLOAD_FAILED_FALLBACK, { id: toastId });
  }
}

function inferImageExtension(url: string, mime: string) {
  const fromUrl = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (fromUrl && /^(png|jpe?g|webp|gif)$/.test(fromUrl)) return fromUrl === "jpeg" ? "jpg" : fromUrl;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
