import JSZip from "jszip";
import { toast } from "sonner";

/**
 * 前端批量下载：fetch 图片 -> JSZip 内存打包 -> 触发单个 zip 下载。
 * 零服务器压力（只消耗浏览器内存），适合任务结果 1-30 张场景。
 */
export async function downloadImagesAsZip(options: {
  urls: string[];
  filename?: string;
  label?: string;
}) {
  const { urls, filename = "pixel-diffusion-batch", label = "图片" } = options;
  const validUrls = urls.filter(Boolean);
  if (!validUrls.length) {
    toast.error("没有可下载的图片");
    return;
  }
  const toastId = toast.loading(`正在打包 ${validUrls.length} 张${label}…`);

  try {
    const zip = new JSZip();
    const folder = zip.folder(filename) || zip;
    await Promise.all(
      validUrls.map(async (url, index) => {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error(`图片 ${index + 1} 下载失败`);
        const blob = await res.blob();
        const ext = inferImageExtension(url, blob.type);
        folder.file(`${String(index + 1).padStart(2, "0")}.${ext}`, blob);
      }),
    );
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerDownload(zipBlob, `${filename}.zip`);
    toast.success(`已打包 ${validUrls.length} 张${label}`, { id: toastId });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "打包失败，请重试", { id: toastId });
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
