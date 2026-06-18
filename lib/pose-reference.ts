import { normalizePosePlanCount } from "@/lib/pose-plan";

export const MAX_POSE_REFERENCE_IMAGES = 8;

export function normalizePoseReferenceUrls(value: unknown, maxCount = MAX_POSE_REFERENCE_IMAGES) {
  const urls = Array.isArray(value)
    ? value
        .map((url) => (typeof url === "string" ? url.trim() : ""))
        .filter(Boolean)
    : [];
  return Array.from(new Set(urls)).slice(0, maxCount);
}

export function getPoseReferenceImageNumberForSlot(params: {
  poseIndex: number;
  referenceCount: number;
  startImageNumber?: number;
  copiesPerReference?: number;
}) {
  const referenceCount = Math.max(0, Math.floor(Number(params.referenceCount) || 0));
  if (referenceCount <= 0) return null;
  const startImageNumber = Math.max(2, Math.floor(Number(params.startImageNumber) || 2));
  const safePoseIndex = Math.max(1, Math.floor(Number(params.poseIndex) || 1));
  const copiesPerReference = normalizePoseReferenceCopies(params.copiesPerReference, referenceCount);
  return startImageNumber + (Math.floor((safePoseIndex - 1) / copiesPerReference) % referenceCount);
}

export function normalizePoseReferenceCopies(value: unknown, referenceCount?: number) {
  void referenceCount;
  const num = Number(value ?? 1);
  if (!Number.isFinite(num)) return 1;
  return Math.max(Math.floor(num), 1);
}

export function buildPoseReferenceImagePrompt(params: {
  referenceCount: number;
  startImageNumber?: number;
  outputMode?: "grid" | "separate";
  poseIndex?: number;
  poseCount?: number;
  copiesPerReference?: number;
}) {
  const referenceCount = Math.max(0, Math.floor(Number(params.referenceCount) || 0));
  if (referenceCount <= 0) return "";

  const startImageNumber = Math.max(2, Math.floor(Number(params.startImageNumber) || 2));
  const endImageNumber = startImageNumber + referenceCount - 1;
  const poseCount = normalizePosePlanCount(params.poseCount ?? referenceCount, referenceCount);
  const copiesPerReference = normalizePoseReferenceCopies(params.copiesPerReference, referenceCount);
  const mapping = params.outputMode === "separate"
    ? `Current request generates pose ${Math.max(1, Math.floor(Number(params.poseIndex) || 1))}; use image ${startImageNumber} as the body-action reference for this slot.`
    : Array.from({ length: poseCount }, (_, index) => {
        const imageNumber = getPoseReferenceImageNumberForSlot({
          poseIndex: index + 1,
          referenceCount,
          startImageNumber,
          copiesPerReference,
        });
        return `pose ${index + 1} -> image ${imageNumber}`;
      }).join("; ");

  return [
    "Pose reference image contract:",
    "image 1 is the only source for person identity, face, hair, gender expression, body proportions, outfit design, garment color, pattern, logo, material texture, background, lighting, skin tone and final photo tone.",
    referenceCount === 1
      ? `image ${startImageNumber} is a pose reference image.`
      : `image ${startImageNumber} to image ${endImageNumber} are pose reference images.`,
    "Use pose reference images only as a skeletal pose control: body action, limb placement, weight shift, body direction, hand and foot position, and head/neck direction when compatible with image 1.",
    "Do not use pose reference images as visual source images. They must not donate the final scene, background, set, floor, wall, furniture, props, handbag, jewelry, accessories, clothing, color palette, lighting, exposure, skin tone, face, hair, body shape, gender expression, camera distance, crop, lens look, text, logos or extra people.",
    `Slot mapping: ${mapping}`,
    "Priority order: image 1 identity/outfit/background/tone/crop safety > current pose plan slot > pose reference skeleton > user supplement. If a pose reference conflicts with image 1 outfit readability, crop range, background continuity or realistic joints, adapt the pose conservatively instead of changing image 1 content.",
  ].join("\n");
}
