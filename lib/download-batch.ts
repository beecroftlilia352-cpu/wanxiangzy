import { toast } from "sonner";
import { fetchMediaBlob, saveBlobToDevice, type MediaDownloadProgress } from "@/lib/media-download";

/**
 * 前端批量下载：受控并发取图 -> JSZip 本地打包 -> 触发单个 zip 下载。
 * 图片合成与压缩不占服务端 CPU；OSS 未开放 CORS 时仅由同源接口流式转发字节。
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
  signal?: AbortSignal;
  onProgress?: (progress: MediaDownloadProgress) => void;
  showToast?: boolean;
}) {
  const {
    urls,
    filename = "pixel-diffusion-batch",
    label = ZIP_DOWNLOAD_DEFAULT_LABEL,
    signal,
    onProgress,
    showToast = true,
  } = options;
  const validUrls = urls.filter(Boolean);
  if (!validUrls.length) {
    if (showToast) toast.error(ZIP_DOWNLOAD_NO_IMAGES);
    if (showToast) return { successCount: 0, failedCount: 0 };
    throw new Error(ZIP_DOWNLOAD_NO_IMAGES);
  }
  const toastId = showToast
    ? toast.loading(`${ZIP_DOWNLOAD_PACKING_PREFIX} ${validUrls.length} ${ZIP_DOWNLOAD_PACKING_UNIT}${label}…`)
    : undefined;

  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const folder = zip.folder(filename) || zip;
    const failures: Array<{ index: number; reason: string }> = [];
    let completed = 0;
    let totalBytes = 0;

    onProgress?.({ phase: "downloading", completed: 0, total: validUrls.length, percent: 0 });
    await mapWithConcurrency(validUrls, 3, async (url, index) => {
      try {
        const blob = await fetchMediaBlob(url, `${index + 1}`, {
          signal,
          forceProxy: true,
        });
        totalBytes += blob.size;
        if (totalBytes > 300 * 1024 * 1024) {
          throw new Error("合集超过 300MB，请分批下载");
        }
        const ext = inferImageExtension(url, blob.type);
        folder.file(`${String(index + 1).padStart(2, "0")}.${ext}`, blob);
      } catch (error) {
        if (signal?.aborted) throw error;
        failures.push({
          index,
          reason: error instanceof Error ? error.message : ZIP_DOWNLOAD_SINGLE_FAILED_SUFFIX,
        });
      } finally {
        completed += 1;
        onProgress?.({
          phase: "downloading",
          completed,
          total: validUrls.length,
          percent: Math.round((completed / validUrls.length) * 82),
        });
      }
    });

    const successCount = validUrls.length - failures.length;
    if (!successCount) {
      throw new Error(failures[0]?.reason || ZIP_DOWNLOAD_FAILED_FALLBACK);
    }
    if (failures.length) {
      folder.file(
        "下载说明.txt",
        [
          `成功：${successCount} 张`,
          `失败：${failures.length} 张`,
          "",
          ...failures.map((item) => `图片 ${item.index + 1}：${item.reason}`),
          "",
          "请在预览区单独重试失败的图片。",
        ].join("\n"),
      );
    }

    onProgress?.({ phase: "packing", completed: successCount, total: validUrls.length, percent: 82 });
    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "STORE", streamFiles: true },
      (metadata) => {
        onProgress?.({
          phase: "packing",
          completed: successCount,
          total: validUrls.length,
          percent: Math.min(99, 82 + Math.round(metadata.percent * 0.17)),
        });
      },
    );
    onProgress?.({ phase: "saving", completed: successCount, total: validUrls.length, percent: 100 });
    saveBlobToDevice(zipBlob, `${filename}${failures.length ? "-partial" : ""}.zip`);
    onProgress?.({ phase: "completed", completed: successCount, total: validUrls.length, percent: 100 });
    if (showToast) {
      if (failures.length) {
        toast.warning(`已打包 ${successCount} 张，${failures.length} 张失败`, { id: toastId });
      } else {
        toast.success(`${ZIP_DOWNLOAD_SUCCESS_PREFIX} ${successCount} ${ZIP_DOWNLOAD_PACKING_UNIT}${label}`, { id: toastId });
      }
    }
    return { successCount, failedCount: failures.length };
  } catch (error) {
    if (showToast) toast.error(error instanceof Error ? error.message : ZIP_DOWNLOAD_FAILED_FALLBACK, { id: toastId });
    if (showToast) return { successCount: 0, failedCount: validUrls.length };
    throw error;
  }
}

function inferImageExtension(url: string, mime: string) {
  const fromUrl = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (fromUrl && /^(png|jpe?g|webp|gif)$/.test(fromUrl)) return fromUrl === "jpeg" ? "jpg" : fromUrl;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}
