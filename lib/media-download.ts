import { Zip, ZipPassThrough } from "fflate";

export type MediaDownloadPhase =
  | "resolving"
  | "downloading"
  | "packing"
  | "saving"
  | "completed";

export type MediaDownloadProgress = {
  phase: MediaDownloadPhase;
  completed: number;
  total: number;
  percent: number | null;
  loadedBytes?: number;
  totalBytes?: number;
};

type DownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: MediaDownloadProgress) => void;
};

/**
 * Hands a single file to the browser's native download manager immediately.
 *
 * Public OSS URLs (e.g. `https://*.oss-cn-*.aliyuncs.com/...`) are handed to
 * the browser directly so we never proxy image bytes through the Next.js
 * server. The endpoint only returns a redirect to a signed attachment URL in
 * a few narrow cases: a public bucket read times out, an internal staging
 * host is not whitelisted, or the URL still points at a private canonical
 * asset (`/api/media-assets/<uuid>`) which has to keep going through the
 * server for ownership and verification checks.
 */
export async function downloadMediaFile(
  url: string,
  filename: string,
  options: DownloadOptions = {},
) {
  if (!url) throw new Error("没有可下载的文件");

  options.onProgress?.({
    phase: "saving",
    completed: 1,
    total: 1,
    percent: 100,
  });

  const downloadUrl = isInlineBrowserUrl(url)
    ? url
    : buildBrowserDownloadUrl(url, filename);
  triggerUrlDownload(downloadUrl, filename);

  options.onProgress?.({ phase: "completed", completed: 1, total: 1, percent: 100 });
}

/** Builds one client-side ZIP so browsers only need to approve one download.
 * Public media is fetched directly when CORS allows it; the authenticated
 * download route is a per-file fallback and never buffers the whole batch. */
export async function downloadMediaFiles(options: {
  urls: string[];
  filenamePrefix: string;
  onProgress?: (progress: MediaDownloadProgress) => void;
  signal?: AbortSignal;
}) {
  const urls = options.urls.filter(Boolean);
  if (!urls.length) throw new Error("没有可下载的图片");
  if (urls.length === 1) {
    await downloadMediaFile(
      urls[0],
      buildIndexedFilename(options.filenamePrefix, urls[0], 0),
      { signal: options.signal, onProgress: options.onProgress },
    );
    return { successCount: 1, failedCount: 0 };
  }

  const stamp = buildDownloadStamp();
  const archiveChunks: ArrayBuffer[] = [];
  let resolveArchive!: () => void;
  let rejectArchive!: (error: Error) => void;
  const archiveCompleted = new Promise<void>((resolve, reject) => {
    resolveArchive = resolve;
    rejectArchive = reject;
  });
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      rejectArchive(error);
      return;
    }
    archiveChunks.push(Uint8Array.from(chunk).buffer);
    if (final) resolveArchive();
  });

  try {
    for (let index = 0; index < urls.length; index += 1) {
      options.signal?.throwIfAborted();
      const filename = buildIndexedFilename(options.filenamePrefix, urls[index], index, stamp);
      const response = await fetchBatchDownloadResponse(urls[index], filename, options.signal);
      if (!response.ok || !response.body) {
        throw new Error(`第 ${index + 1} 张图片下载失败`);
      }

      const entry = new ZipPassThrough(filename);
      archive.add(entry);
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        options.signal?.throwIfAborted();
        entry.push(value, false);
      }
      entry.push(new Uint8Array(0), true);

      const completed = index + 1;
      options.onProgress?.({
        phase: "downloading",
        completed,
        total: urls.length,
        percent: Math.round((completed / urls.length) * 90),
      });
    }

    options.onProgress?.({
      phase: "packing",
      completed: urls.length,
      total: urls.length,
      percent: 95,
    });
    archive.end();
    await archiveCompleted;
    options.signal?.throwIfAborted();

    const archiveName = `${sanitizeFilenamePrefix(options.filenamePrefix)}-${stamp}.zip`;
    const objectUrl = URL.createObjectURL(new Blob(archiveChunks, { type: "application/zip" }));
    options.onProgress?.({ phase: "saving", completed: urls.length, total: urls.length, percent: 100 });
    triggerUrlDownload(objectUrl, archiveName);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    options.onProgress?.({ phase: "completed", completed: urls.length, total: urls.length, percent: 100 });
    return { successCount: urls.length, failedCount: 0 };
  } catch (error) {
    archive.terminate();
    throw error;
  }
}

async function fetchBatchDownloadResponse(url: string, filename: string, signal?: AbortSignal) {
  if (isInlineBrowserUrl(url)) return fetch(url, { signal });

  if (isDirectlyDownloadableUrl(url)) {
    try {
      const direct = await fetch(url, { credentials: "omit", signal });
      if (direct.ok && direct.body) return direct;
      await direct.body?.cancel();
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  const endpoint = new URL("/api/download-image", window.location.origin);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("filename", filename);
  endpoint.searchParams.set("proxy", "1");
  return fetch(endpoint, { credentials: "same-origin", signal });
}

function buildBrowserDownloadUrl(url: string, filename: string) {
  // Public OSS objects and the few non-OSS hosts we already allow are handed
  // to the browser as-is so Chrome (and other user agents that block
  // cross-origin downloads) can save the file directly. Canonical media
  // assets are always routed through the server-side proxy because their
  // ownership and verification status must be checked before the bytes leave
  // the origin.
  if (isCanonicalMediaAssetUrl(url)) {
    const endpoint = new URL(url, window.location.origin);
    endpoint.searchParams.set("filename", filename);
    return endpoint.toString();
  }
  if (isDirectlyDownloadableUrl(url)) return url;
  const endpoint = new URL("/api/download-image", window.location.origin);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("filename", filename);
  endpoint.searchParams.set("proxy", "1");
  return endpoint.toString();
}

function isInlineBrowserUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:");
}

function isCanonicalMediaAssetUrl(url: string) {
  return /^\/?api\/media-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:[/?#]|$)/i.test(url);
}

function isDirectlyDownloadableUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/\.oss-cn-(hongkong|hangzhou|shanghai|shenzhen|beijing|qingdao)\.aliyuncs\.com$/.test(host)) return true;
    if (host === "oss.filenest.top") return true;
    if (host === "vasthk.cn-hongkong.thepacificgls.com" || host === "cn-hongkong.thepacificgls.com") return true;
    if (host === "replicate.delivery") return true;
    if (host === "i.ibb.co" || host.endsWith(".ibb.co")) return true;
    if (host === "yunwu.ai") return true;
    if (host === "webstatic.aiproxy.vip") return true;
    if (host.endsWith(".fashn.ai") || host === "fashn.ai") return true;
    if (host.endsWith(".lingyaai.cn") || host === "lingyaai.cn") return true;
    if (host.endsWith(".sssai.vip") || host === "sssai.vip") return true;
    if (host.endsWith(".supabase.co")) return true;
    if (host === "t.filesystem.site") return true;
    return false;
  } catch {
    return false;
  }
}

function buildIndexedFilename(prefix: string, url: string, index: number, stamp = buildDownloadStamp()) {
  const safePrefix = sanitizeFilenamePrefix(prefix);
  let extension = "png";
  try {
    const fromPath = new URL(url, window.location.origin).pathname.split(".").pop()?.toLowerCase();
    if (fromPath && /^(png|jpe?g|webp|gif)$/.test(fromPath)) {
      extension = fromPath === "jpeg" ? "jpg" : fromPath;
    }
  } catch {
    // Keep the safe image default when a browser-local URL has no extension.
  }
  return `${safePrefix}-${stamp}-${String(index + 1).padStart(2, "0")}.${extension}`;
}

function buildDownloadStamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sanitizeFilenamePrefix(prefix: string) {
  return prefix
    .replace(/\.(zip|png|jpe?g|webp|gif)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 80) || "results";
}

function triggerUrlDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
