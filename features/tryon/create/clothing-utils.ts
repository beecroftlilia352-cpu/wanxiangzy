import type { TryOnClothingMode, TryOnClothingRole } from "@/lib/tryon-upload-rules";
import { TRYON_CLOTHING_ROLE_LABELS } from "@/lib/tryon-upload-rules";
import { createPlaceholderFile } from "./asset-utils";
import type { ClothingItemState } from "./types";

export type VisibleClothingItem = {
  preview: string;
  url: string;
  role: TryOnClothingRole;
};

export function getDefaultClothingRole(index: number, clothingMode: TryOnClothingMode): TryOnClothingRole {
  if (clothingMode !== "multi") return "single";
  if (index === 0) return "upper";
  if (index === 1) return "lower";
  return "extra";
}

export function buildVisibleClothingItems(params: {
  previews: string[];
  urls: string[];
  roles: TryOnClothingRole[];
  clothingMode: TryOnClothingMode;
}): VisibleClothingItem[] {
  return params.previews
    .map((preview, index) => ({
      preview,
      url: params.urls[index],
      role: params.roles[index] || getDefaultClothingRole(index, params.clothingMode),
    }))
    .filter((item) => item.url);
}

export function buildClothingItemStates(params: {
  files: File[];
  previews: string[];
  urls: string[];
  roles: TryOnClothingRole[];
  clothingMode: TryOnClothingMode;
}): ClothingItemState[] {
  return params.previews
    .map((preview, index) => ({
      file: params.files[index] || createPlaceholderFile(`clothing-${index + 1}.jpg`),
      preview,
      url: params.urls[index],
      role: params.roles[index] || getDefaultClothingRole(index, params.clothingMode),
    }))
    .filter((item) => item.url);
}

export function getGarmentDetailOwnerLabel(role: TryOnClothingRole, index: number) {
  return TRYON_CLOTHING_ROLE_LABELS[role] || `服装${index + 1}`;
}
