export const MAX_GARMENT_ANGLE_IMAGES = 5;

export type GarmentAngleTarget = "outfit" | "upper" | "lower" | "extra";
export type GarmentAngleView = "front" | "back" | "side" | "flat" | "other";

export type GarmentAngleReference = {
  url: string;
  target: GarmentAngleTarget;
  view: GarmentAngleView;
};

export const GARMENT_ANGLE_SWITCH_DESCRIPTION =
  "用于补充同一服装的正面、背面、侧面、平铺或悬挂视角。只校准服装结构与隐藏面，不会作为人物、姿势、脸、背景或光线参考。";

export const GARMENT_ANGLE_UPLOAD_FOOTNOTE =
  "优先上传同一件服装的完整角度图。上下装分开时，请先选择上装或下装归属，再上传对应角度，避免结构串到另一件衣服上。";

export const GARMENT_ANGLE_TARGET_LABELS: Record<GarmentAngleTarget, string> = {
  outfit: "整套/连体",
  upper: "上装",
  lower: "下装",
  extra: "配饰/单品",
};

export const GARMENT_ANGLE_VIEW_LABELS: Record<GarmentAngleView, string> = {
  front: "正面",
  back: "背面",
  side: "侧面",
  flat: "平铺/悬挂",
  other: "其他角度",
};

export const GARMENT_ANGLE_TARGET_OPTIONS: { value: GarmentAngleTarget; label: string; description: string }[] = [
  { value: "outfit", label: GARMENT_ANGLE_TARGET_LABELS.outfit, description: "整套搭配、连衣裙、套装" },
  { value: "upper", label: GARMENT_ANGLE_TARGET_LABELS.upper, description: "领口、肩线、袖子、后背" },
  { value: "lower", label: GARMENT_ANGLE_TARGET_LABELS.lower, description: "腰头、裙摆、裤腿、后袋" },
  { value: "extra", label: GARMENT_ANGLE_TARGET_LABELS.extra, description: "包、围巾、帽子等" },
];

export const GARMENT_ANGLE_VIEW_OPTIONS: { value: GarmentAngleView; label: string }[] = [
  { value: "front", label: GARMENT_ANGLE_VIEW_LABELS.front },
  { value: "back", label: GARMENT_ANGLE_VIEW_LABELS.back },
  { value: "side", label: GARMENT_ANGLE_VIEW_LABELS.side },
  { value: "flat", label: GARMENT_ANGLE_VIEW_LABELS.flat },
  { value: "other", label: GARMENT_ANGLE_VIEW_LABELS.other },
];

export function normalizeGarmentAngleReferences(value: unknown, max = MAX_GARMENT_ANGLE_IMAGES): GarmentAngleReference[] {
  if (!Array.isArray(value)) return [];
  const refs: GarmentAngleReference[] = [];
  const seen = new Set<string>();
  const safeMax = Math.max(0, Math.floor(Number(max) || 0));

  for (const item of value) {
    if (refs.length >= safeMax) break;
    const ref = normalizeGarmentAngleReference(item);
    if (!ref || seen.has(ref.url)) continue;
    seen.add(ref.url);
    refs.push(ref);
  }

  return refs;
}

export function flattenGarmentAngleReferences(references: GarmentAngleReference[] | null | undefined) {
  return normalizeGarmentAngleReferences(references).map((ref) => ref.url);
}

export function formatGarmentAngleReferenceLabel(ref: GarmentAngleReference, fallbackIndex: number) {
  const target = GARMENT_ANGLE_TARGET_LABELS[ref.target] || `服装${fallbackIndex + 1}`;
  const view = GARMENT_ANGLE_VIEW_LABELS[ref.view] || "角度";
  return `${target}${view}`;
}

export function buildPoseGarmentAngleReferencePrompt(params: {
  references: GarmentAngleReference[];
  startImageNumber?: number;
}) {
  const references = normalizeGarmentAngleReferences(params.references);
  if (!references.length) return "";
  const startImageNumber = Math.max(2, Math.floor(Number(params.startImageNumber) || 2));
  const lines = references.map((ref, index) => {
    const imageRef = `image ${startImageNumber + index}`;
    const target = GARMENT_ANGLE_TARGET_LABELS[ref.target];
    const view = GARMENT_ANGLE_VIEW_LABELS[ref.view];
    const scope = getGarmentAngleScope(ref.target);
    return `${imageRef} = ${target}${view}角度参考，只用于${scope}的同款结构、正背侧面关系、开合方式、缝线位置、口袋/纽扣/拉链/下摆/腰头等可见构造；不得影响其他服装区域。`;
  });

  return [
    "服装角度参考规则：",
    ...lines,
    "这些角度图不是新服装、不是局部纹理增强、不是商品重设计、不是人物/脸/姿势/身体/背景/光线参考；不要复制角度图中的模特、人体、姿势、裁切、场景或拍摄光线。",
    "生成姿势裂变时，主图 image 1 仍控制人物身份、原始穿搭关系、整体配色、材质观感和可见服装外观；图1可见正面外观优先，角度图只在同一件服装的隐藏面或转身可见面上补全结构。",
    "正面姿势不要把背面结构强行放到正面，背面/侧面姿势也不要凭空改款；只有当新姿势真实露出背面、侧面、袖后、裤后袋、裙摆后片等区域时，才使用对应角度信息。",
    "上下装冲突时，上装角度只影响上装，下装角度只影响下装；整套/连体角度用于保持连衣裙、连体裤、套装的整体结构连续性，不得把上下结构拆散或串到另一件衣服上。",
  ].join("\n");
}

function normalizeGarmentAngleReference(value: unknown): GarmentAngleReference | null {
  if (typeof value === "string") {
    const url = value.trim();
    return url ? { url, target: "outfit", view: "other" } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!url) return null;
  return {
    url,
    target: normalizeGarmentAngleTarget(record.target ?? record.garmentTarget ?? record.garment_target),
    view: normalizeGarmentAngleView(record.view ?? record.angle ?? record.viewAngle ?? record.view_angle),
  };
}

function normalizeGarmentAngleTarget(value: unknown): GarmentAngleTarget {
  if (value === "upper" || value === "lower" || value === "extra" || value === "outfit") return value;
  if (value === "single" || value === "full" || value === "whole") return "outfit";
  return "outfit";
}

function normalizeGarmentAngleView(value: unknown): GarmentAngleView {
  if (value === "front" || value === "back" || value === "side" || value === "flat" || value === "other") return value;
  return "other";
}

function getGarmentAngleScope(target: GarmentAngleTarget) {
  if (target === "upper") return "上装";
  if (target === "lower") return "下装";
  if (target === "extra") return "配饰/单品";
  return "整套/连体服装";
}
