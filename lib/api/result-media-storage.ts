import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";
import { isStableStoredMediaUrl, storeMedia } from "@/lib/api/media-storage";
import { isLikelyVideoUrl } from "@/lib/media";
import {
  isAliyunOssRemoteTransferEnabled,
  mirrorRemoteMediaToAliyunOss,
} from "@/lib/api/oss-mirror-transfer";
import { isRemoteUrl } from "@/lib/utils";
import { canonicalizeStoredGeneratedObject } from "@/lib/api/generated-media-asset.server";

export async function persistGeneratedMediaUrls(
  urls: string[],
  generationId: string,
  options: { forceServerDownload?: boolean; startIndex?: number; mediaType?: "auto" | "image" | "video" } = {}
) {
  const persistedUrls: string[] = [];

  for (let index = 0; index < urls.length; index++) {
    const name = `${generationId}-${(options.startIndex || 0) + index + 1}`;
    persistedUrls.push(await persistGeneratedMediaUrl(urls[index], name, options));
  }

  return persistedUrls;
}

async function persistGeneratedMediaUrl(
  urlOrDataUrl: string,
  name: string,
  options: { forceServerDownload?: boolean; mediaType?: "auto" | "image" | "video" }
) {
  const mediaType = options.mediaType || "auto";
  if (mediaType !== "video") {
    const shouldTreatAsImage = mediaType === "image" || !isLikelyVideoUrl(urlOrDataUrl);
    if (shouldTreatAsImage) {
      const [persisted] = await persistGeneratedImageUrls([urlOrDataUrl], name, options);
      return persisted || urlOrDataUrl;
    }
  }

  if (isStableStoredMediaUrl(urlOrDataUrl)) return urlOrDataUrl;
  if (isRemoteUrl(urlOrDataUrl) && isAliyunOssRemoteTransferEnabled()) {
    return mirrorRemoteMediaToAliyunOss(urlOrDataUrl, name);
  }
  try {
    const stored = await storeMedia(
      {
        media: urlOrDataUrl,
        name,
        namePrefix: "generated-",
        storageClass: "generated",
        forbidOverwrite: true,
      },
      { suppressErrorLog: true }
    );
    if (process.env.NODE_ENV === "production" && stored.object_key) {
      return canonicalizeStoredGeneratedObject(stored, name);
    }
    if (process.env.NODE_ENV === "production") throw new Error("generated media storage bypassed the canonical media registry");
    return stored.url;
  } catch (err) {
    throw new Error(
      `generated media was not durably stored: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
