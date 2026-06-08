export type GarmentType = "上装" | "下装" | "连体衣" | "其他";

export const GARMENT_TYPE_OPTIONS: GarmentType[] = ["上装", "下装", "连体衣", "其他"];

export function normalizeGarmentType(value: unknown): GarmentType {
  return GARMENT_TYPE_OPTIONS.includes(value as GarmentType) ? value as GarmentType : "上装";
}

export function resolveGarmentTypeLabel(type: unknown, customType?: unknown) {
  const normalized = normalizeGarmentType(type);
  if (normalized !== "其他") return normalized;
  const custom = typeof customType === "string" ? customType.trim() : "";
  return custom || "其他服装";
}
