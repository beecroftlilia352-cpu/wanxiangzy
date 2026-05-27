import { persistGeneratedImageUrls } from "@/lib/api/result-image-storage";
import { isStableStoredMediaUrl, storeMedia } from "@/lib/api/media-storage";
import { isLikelyVideoUrl } from "@/lib/media";

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
  try {
    const stored = await storeMedia(
      {
        media: urlOrDataUrl,
        name,
        namePrefix: "generated-",
        storageClass: "generated",
      },
      { suppressErrorLog: true }
    );
    return stored.url;
  } catch (err) {
    console.warn(
      "[result-media-storage] generated media storage failed; falling back to provider URL:",
      err instanceof Error ? err.message : String(err)
    );
    return urlOrDataUrl;
  }
}
