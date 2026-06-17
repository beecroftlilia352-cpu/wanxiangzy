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
    "Use pose reference images only for commercial model body action, limb placement, weight shift, body direction, hand and foot position, head/neck direction, gaze rhythm when compatible, and camera/framing rhythm.",
    "Never copy from pose reference images: person identity, face, hair, body shape, gender expression, clothing, garment details, colors, patterns, background, lighting, color grading, skin tone, props, text, logos or extra people.",
    `Slot mapping: ${mapping}`,
    "Priority order: source identity/outfit/tone/crop safety > current pose plan slot > pose reference action > user supplement. If a pose reference conflicts with source outfit readability, crop range or realistic joints, adapt the pose conservatively instead of changing source identity or outfit.",
  ].join("\n");
}
