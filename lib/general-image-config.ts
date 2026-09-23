export const MAX_GENERAL_IMAGE_REFERENCE_IMAGES = 14;
export const MAX_GENERAL_IMAGE_SPLIT_REFERENCES = 6;
export const MAX_GENERAL_IMAGE_OUTPUT_COUNT = 4;
/** Absolute ceiling for a one-per-reference run: 6 references × 4 images each. */
export const MAX_GENERAL_IMAGE_TOTAL_COUNT = MAX_GENERAL_IMAGE_SPLIT_REFERENCES
  * MAX_GENERAL_IMAGE_OUTPUT_COUNT;

export type GeneralImageMode = "text-to-image" | "image-to-image";

export function getGeneralImageDefaultSettings(mode: GeneralImageMode) {
  return {
    model: mode === "text-to-image" ? "gpt-image-2" : "nano-banana-2",
    aspectRatio: "1:1",
    imageSize: "1K",
  } as const;
}
