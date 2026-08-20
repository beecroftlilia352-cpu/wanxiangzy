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

export async function prepareMediaDownloads(options: {
  urls: string[];
  filenamePrefix: string;
  signal?: AbortSignal;
}) {
  const urls = options.urls.filter(Boolean);
  const stamp = buildDownloadStamp();
  return Promise.all(urls.map(async (url, index) => {
    const filename = buildIndexedFilename(options.filenamePrefix, url, index, stamp);
    return {
      url: await resolveBrowserDownloadUrl(url, filename, options.signal),
      filename,
    };
  }));
}

/** Hands every pre-resolved OSS URL to the browser synchronously inside the
 * original click. The server only authenticates canonical assets and returns
 * short-lived signed URLs; image bytes never pass through Next.js. */
export async function downloadMediaFiles(options: {
  urls: string[];
  filenamePrefix: string;
  preparedDownloads?: Array<{ url: string; filename: string }>;
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

  const downloads = options.preparedDownloads?.length === urls.length
    ? options.preparedDownloads
    : await prepareMediaDownloads(options);
  options.signal?.throwIfAborted();

  downloads.forEach((download, index) => {
    triggerIsolatedUrlDownload(download.url);
    const completed = index + 1;
    options.onProgress?.({
      phase: "saving",
      completed,
      total: downloads.length,
      percent: Math.round((completed / downloads.length) * 100),
    });
  });
  options.onProgress?.({
    phase: "completed",
    completed: downloads.length,
    total: downloads.length,
    percent: 100,
  });
  return { successCount: downloads.length, failedCount: 0 };
}

async function resolveBrowserDownloadUrl(url: string, filename: string, signal?: AbortSignal) {
  if (isInlineBrowserUrl(url) || isDirectlyDownloadableUrl(url)) return url;

  const endpoint = new URL("/api/download-image", window.location.origin);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("filename", filename);
  endpoint.searchParams.set("resolve", "1");
  const response = await fetch(endpoint, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error("下载地址准备失败，请重试");
  const payload = await response.json() as { strategy?: unknown; url?: unknown };
  if (payload.strategy !== "direct" || typeof payload.url !== "string" || !/^https?:\/\//i.test(payload.url)) {
    throw new Error("下载地址准备失败，请重试");
  }
  return payload.url;
}

function buildBrowserDownloadUrl(url: string, filename: string) {
  // Public OSS objects and the few non-OSS hosts we already allow are handed
  // to the browser as-is so Chrome (and other user agents that block
  // cross-origin downloads) can save the file directly. Canonical media
  // assets always use the authenticated route first so ownership and
  // verification are checked before the browser is redirected to OSS.
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

function triggerIsolatedUrlDownload(url: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = url;
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 60_000);
}
