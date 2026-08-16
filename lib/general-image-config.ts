export const MAX_GENERAL_IMAGE_REFERENCE_IMAGES = 14;

export type GeneralImageMode = "text-to-image" | "image-to-image";

export function getGeneralImageDefaultSettings(mode: GeneralImageMode) {
  return {
    model: mode === "text-to-image" ? "gpt-image-2" : "nano-banana-pro",
    aspectRatio: "3:4",
    imageSize: "2K",
  } as const;
}
