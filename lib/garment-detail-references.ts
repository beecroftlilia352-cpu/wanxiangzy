export const MAX_GARMENT_DETAIL_IMAGES = 5;

export const GARMENT_DETAIL_SWITCH_DESCRIPTION =
  "用来补充服装的局部细节，比如面料、领口、口袋、纽扣。开启后最多 5 张，不会改动人物、姿势、背景和整体色调。";

export const GARMENT_DETAIL_UPLOAD_FOOTNOTE =
  "拍得越清晰、越近距离越好。每张只拍一个部位就够了，比如只拍领口、或只拍袖口。";

export function normalizeGarmentDetailUrls(value: unknown, max = MAX_GARMENT_DETAIL_IMAGES): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= max) break;
  }

  return urls;
}

export function buildGarmentDetailReferencePrompt(count: number) {
  const safeCount = Math.min(Math.max(Math.floor(Number(count) || 0), 0), MAX_GARMENT_DETAIL_IMAGES);
  if (!safeCount) return "";
  const imageWord = safeCount === 1 ? "image" : "images";

  return [
    `Garment detail references: the final ${safeCount} appended input ${imageWord} are optional detail references for the existing garment only.`,
    "Use them only to recover local clothing details such as fabric weave, collar, cuffs, pockets, zipper/buttons, logo/text, back view, side view, lining, stitching, seams, and close-up construction.",
    "They are appended after all existing task images and must not change the existing image-reference numbering or the main source/target relationship.",
    "If any detail reference conflicts with the main garment/source image, the main garment/source image wins.",
    "Do not change the person, pose, face, body proportions, background, camera framing, exposure, contrast, white balance, overall color grade, garment silhouette, main color, pattern placement, or logo placement.",
    "Do not sharpen or invent dense stripes, trouser texture, moire, fake weave, or noisy fibers; apply only light, local, realistic garment-detail recovery.",
  ].join(" ");
}
