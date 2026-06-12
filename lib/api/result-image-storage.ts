import { getBase64Payload, isStableStoredImageUrl, storeImage } from "@/lib/api/image-storage";
import { isRemoteUrl } from "@/lib/utils";

export async function persistGeneratedImageUrls(
  urls: string[],
  generationId: string,
  options: { forceServerDownload?: boolean; startIndex?: number } = {}
) {
  const concurrency = 4;
  const results: string[] = new Array(urls.length);
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((url, batchIndex) => 
        persistGeneratedImageUrl(url, `${generationId}-${(options.startIndex || 0) + i + batchIndex + 1}`, options)
      )
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
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
