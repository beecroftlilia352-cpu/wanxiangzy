const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const IMAGE_UPLOAD_TIMEOUT_MS = 45000;

export async function persistGeneratedImageUrls(urls: string[], generationId: string) {
  const persistedUrls: string[] = [];

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    persistedUrls.push(await persistGeneratedImageUrl(url, `${generationId}-${index + 1}`));
  }

  return persistedUrls;
}

async function persistGeneratedImageUrl(urlOrDataUrl: string, name: string) {
  if (isStableImageHost(urlOrDataUrl)) return urlOrDataUrl;

  const imagePayload = urlOrDataUrl.startsWith("data:")
    ? getBase64Payload(urlOrDataUrl)
    : urlOrDataUrl;

  return uploadImageToImgbb(imagePayload, name);
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

  return data.data.display_url || data.data.url;
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
