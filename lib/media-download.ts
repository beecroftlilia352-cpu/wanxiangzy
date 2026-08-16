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

export type DownloadTarget = {
  strategy: "direct" | "proxy";
  url: string;
};

type DownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: MediaDownloadProgress) => void;
};

type FetchBlobOptions = DownloadOptions & {
  forceProxy?: boolean;
};

const DOWNLOAD_REQUEST_TIMEOUT_MS = 45_000;
const DOWNLOAD_RESOLVE_TIMEOUT_MS = 12_000;
const DOWNLOAD_RETRY_DELAYS_MS = [0, 650] as const;

/**
 * Starts a user-visible download with the lightest reliable transport.
 *
 * OSS assets are resolved to a short-lived attachment URL and handed to the
 * browser directly, so application servers never relay the file. Other hosts
 * use the guarded same-origin proxy and expose byte progress when available.
 */
export async function downloadMediaFile(
  url: string,
  filename: string,
  options: DownloadOptions = {},
) {
  if (!url) throw new Error("没有可下载的文件");

  options.onProgress?.({
    phase: "resolving",
    completed: 0,
    total: 1,
    percent: null,
  });

  if (isBrowserLocalUrl(url)) {
    const blob = await fetchBlobFromUrl(url, options);
    options.onProgress?.({ phase: "saving", completed: 1, total: 1, percent: 100 });
    saveBlobToDevice(blob, filename);
  } else {
    let target: DownloadTarget;
    try {
      target = await resolveDownloadTarget(url, filename, options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // The resolver is intentionally tiny, but a transient application-edge
      // failure should not strand the user. The guarded proxy remains the
      // final reliable path and will surface the authoritative error.
      target = buildProxyTarget(url, filename);
    }
    if (target.strategy === "direct") {
      options.onProgress?.({ phase: "saving", completed: 1, total: 1, percent: 100 });
      triggerUrlDownload(target.url, filename);
    } else {
      const blob = await fetchBlobWithRetry(target.url, options);
      options.onProgress?.({ phase: "saving", completed: 1, total: 1, percent: 100 });
      saveBlobToDevice(blob, filename);
    }
  }

  options.onProgress?.({ phase: "completed", completed: 1, total: 1, percent: 100 });
}

/** Fetches media bytes for local ZIP creation. The proxy is forced because
 * cross-origin OSS responses do not expose readable bodies without CORS. */
export async function fetchMediaBlob(
  url: string,
  filename: string,
  options: FetchBlobOptions = {},
) {
  if (!url) throw new Error("没有可下载的文件");
  if (isBrowserLocalUrl(url)) return fetchBlobFromUrl(url, options);

  const target = options.forceProxy
    ? buildProxyTarget(url, filename)
    : await resolveDownloadTarget(url, filename, options.signal);
  return fetchBlobWithRetry(
    target.strategy === "proxy" ? target.url : buildProxyTarget(url, filename).url,
    options,
  );
}

export async function resolveDownloadTarget(
  url: string,
  filename: string,
  signal?: AbortSignal,
): Promise<DownloadTarget> {
  const endpoint = new URL("/api/download-image", window.location.origin);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("filename", filename);
  endpoint.searchParams.set("resolve", "1");

  const response = await fetchWithTimeout(endpoint.toString(), {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  }, DOWNLOAD_RESOLVE_TIMEOUT_MS);

  if (!response.ok) throw await createDownloadError(response);
  const payload = await response.json().catch(() => null) as DownloadTarget | null;
  if (!payload || !payload.url || !["direct", "proxy"].includes(payload.strategy)) {
    throw new Error("下载服务返回了无效地址");
  }
  return payload;
}

export function saveBlobToDevice(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function buildProxyTarget(url: string, filename: string): DownloadTarget {
  const endpoint = new URL("/api/download-image", window.location.origin);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("filename", filename);
  endpoint.searchParams.set("proxy", "1");
  return { strategy: "proxy", url: endpoint.toString() };
}

async function fetchBlobWithRetry(url: string, options: DownloadOptions) {
  let lastError: unknown;
  for (let attempt = 0; attempt < DOWNLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (DOWNLOAD_RETRY_DELAYS_MS[attempt] > 0) {
        await delay(DOWNLOAD_RETRY_DELAYS_MS[attempt], options.signal);
      }
      return await fetchBlobFromUrl(url, options);
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("下载失败，请稍后重试");
}

async function fetchBlobFromUrl(url: string, options: DownloadOptions) {
  const response = await fetchWithTimeout(url, {
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  }, DOWNLOAD_REQUEST_TIMEOUT_MS);
  if (!response.ok) throw await createDownloadError(response);

  const totalBytes = parseContentLength(response.headers.get("content-length"));
  if (!response.body) {
    const blob = await response.blob();
    options.onProgress?.({
      phase: "downloading",
      completed: 1,
      total: 1,
      percent: 100,
      loadedBytes: blob.size,
      totalBytes: blob.size,
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loadedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
    loadedBytes += value.byteLength;
    options.onProgress?.({
      phase: "downloading",
      completed: totalBytes > 0 && loadedBytes >= totalBytes ? 1 : 0,
      total: 1,
      percent: totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null,
      loadedBytes,
      totalBytes: totalBytes || undefined,
    });
  }

  return new Blob(chunks, {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
}

async function createDownloadError(response: Response) {
  const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null;
  const message = typeof payload?.error === "string" ? payload.error : "";
  if (message) return new Error(message);
  if (response.status === 401) return new Error("登录状态已失效，请重新登录后下载");
  if (response.status === 413) return new Error("图片文件过大，请单张下载或稍后重试");
  if (response.status === 429) return new Error("下载请求较多，请稍后重试");
  if (response.status === 504) return new Error("下载超时，请检查网络后重试");
  return new Error(`下载失败 (${response.status})`);
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

function isBrowserLocalUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/");
}

function parseContentLength(value: string | null) {
  const size = Number(value || 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = mergeAbortSignals(init.signal, timeoutController.signal);
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (timeoutController.signal.aborted && !init.signal?.aborted) {
      throw new Error("下载超时，请检查网络后重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function mergeAbortSignals(first: AbortSignal | null | undefined, second: AbortSignal) {
  if (!first) return second;
  if (first.aborted) return first;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([first, second]);

  const controller = new AbortController();
  const abort = () => controller.abort();
  first.addEventListener("abort", abort, { once: true });
  second.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(abortError());
    }, { once: true });
  });
}

function abortError() {
  return new DOMException("操作已取消", "AbortError");
}
