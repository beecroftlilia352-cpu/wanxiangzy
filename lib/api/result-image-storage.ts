import { getBase64Payload, isStableStoredImageUrl, storeImage } from "@/lib/api/image-storage";
import {
  isAliyunOssRemoteTransferEnabled,
  mirrorRemoteImageToAliyunOss,
} from "@/lib/api/oss-mirror-transfer";
import { isRemoteUrl } from "@/lib/utils";
import { canonicalizeStoredGeneratedObject } from "@/lib/api/generated-media-asset.server";

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
    if (isAliyunOssRemoteTransferEnabled()) {
      // Production is fail-closed: a provider capability is never persisted as
      // a result URL. This resolves only after the dedicated transfer worker
      // has stored and verified the OSS object.
      return mirrorRemoteImageToAliyunOss(urlOrDataUrl, name);
    }
    try {
      return await storeGeneratedImage(urlOrDataUrl, name, { suppressErrorLog: true });
    } catch (err) {
      throw new Error(
        `generated image was not durably stored: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return storeGeneratedImage(urlOrDataUrl, name);
}

async function storeGeneratedImage(
  image: string,
  name: string,
  options: { suppressErrorLog?: boolean } = {}
) {
  const stored = await storeImage({
    image,
    name,
    namePrefix: "generated-",
    storageClass: "generated",
    forbidOverwrite: true,
  }, options);
  if (process.env.NODE_ENV === "production" && stored.object_key) {
    return canonicalizeStoredGeneratedObject(stored, name);
  }
  if (process.env.NODE_ENV === "production") throw new Error("generated image storage bypassed the canonical media registry");
  return stored.url;
}
