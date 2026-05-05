const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const IMAGE_UPLOAD_TIMEOUT_MS = 45000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;
const MAX_RESULT_IMAGE_BYTES = 25 * 1024 * 1024;

export async function persistGeneratedImageUrls(
  urls: string[],
  generationId: string,
  options: { forceServerDownload?: boolean; startIndex?: number } = {}
) {
  const persistedUrls: string[] = [];

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    persistedUrls.push(await persistGeneratedImageUrl(url, `${generationId}-${(options.startIndex || 0) + index + 1}`, options));
  }

  return persistedUrls;
}

async function persistGeneratedImageUrl(
  urlOrDataUrl: string,
  name: string,
  options: { forceServerDownload?: boolean }
) {
  if (isStableImageHost(urlOrDataUrl)) return urlOrDataUrl;

  const imagePayload = urlOrDataUrl.startsWith("data:")
    ? getBase64Payload(urlOrDataUrl)
    : options.forceServerDownload
      ? await downloadRemoteImageAsBase64(urlOrDataUrl)
      : urlOrDataUrl;

  return uploadImageToImgbb(imagePayload, name);
}

async function downloadRemoteImageAsBase64(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("生成结果图片 URL 无效，无法转存图床");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("生成结果图片 URL 协议无效，无法转存图床");
  }

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 VastWear Image Persist/1.0",
    },
    signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.error("[result-image-storage] remote image download error:", response.status, parsedUrl.hostname);
    throw new Error(`生成结果图片下载失败: ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESULT_IMAGE_BYTES) {
    throw new Error("生成结果图片过大，无法转存图床");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_RESULT_IMAGE_BYTES) {
    throw new Error("生成结果图片过大，无法转存图床");
  }

  return Buffer.from(arrayBuffer).toString("base64");
}

async function uploadImageToImgbb(image: string, name: string) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("图床上传服务未配置 IMGBB_API_KEY");
  }

  const form = new FormData();
  form.append("key", apiKey);
  form.append("image", image);
  form.append("name", `generated-${name}`);

  const response = await fetch(IMGBB_API_URL, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(IMAGE_UPLOAD_TIMEOUT_MS),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("[result-image-storage] imgbb upload error:", response.status, responseText.slice(0, 500));
    throw new Error(`生成结果图片转存图床失败: ${response.status}`);
  }

  const data = JSON.parse(responseText);
  if (!data.success || !data.data?.url) {
    console.error("[result-image-storage] imgbb upload failed:", responseText.slice(0, 500));
    throw new Error("生成结果图片转存图床失败");
  }

  return data.data.url;
}

function getBase64Payload(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function isStableImageHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "i.ibb.co" || host.endsWith(".ibb.co");
  } catch {
    return false;
  }
}
