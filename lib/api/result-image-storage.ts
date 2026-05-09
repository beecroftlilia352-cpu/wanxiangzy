import { getBase64Payload, isStableStoredImageUrl, storeImage } from "@/lib/api/image-storage";

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
  _options: { forceServerDownload?: boolean }
) {
  if (isStableStoredImageUrl(urlOrDataUrl)) return urlOrDataUrl;

  if (urlOrDataUrl.startsWith("data:")) {
    return storeGeneratedImage(getBase64Payload(urlOrDataUrl), name);
  }

  if (isRemoteUrl(urlOrDataUrl)) {
    try {
      return await storeGeneratedImage(urlOrDataUrl, name, { suppressErrorLog: true });
    } catch (err) {
      console.warn(
        "[result-image-storage] generated image storage failed; falling back to provider URL:",
        err instanceof Error ? err.message : String(err)
      );
      return urlOrDataUrl;
    }
  }

  return storeGeneratedImage(urlOrDataUrl, name);
}

async function storeGeneratedImage(
  image: string,
  name: string,
  options: { suppressErrorLog?: boolean } = {}
) {
  const stored = await storeImage({ image, name, namePrefix: "generated-", storageClass: "generated" }, options);
  return stored.url;
}

function isRemoteUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
