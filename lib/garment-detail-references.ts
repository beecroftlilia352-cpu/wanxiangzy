import { CURATED_MULTI_IMAGE_UPLOAD_LIMIT } from "@/lib/multi-image-upload-limits";

export const MAX_GARMENT_DETAIL_IMAGES = CURATED_MULTI_IMAGE_UPLOAD_LIMIT;

export const GARMENT_DETAIL_SWITCH_DESCRIPTION =
  "用来补充服装的局部细节，比如面料、领口、口袋、纽扣，或者背面、侧面。开启后最多 4 张，不会改动人物、姿势、背景和整体色调。";

export const GARMENT_DETAIL_UPLOAD_FOOTNOTE =
  "拍得越清晰、越近距离越好。多件服装时，请把细节图放到对应服装下面，避免上装和下装串味。";

export type GarmentDetailReferenceGroup = {
  clothingIndex: number;
  urls: string[];
};

export type GarmentDetailPromptGroup = GarmentDetailReferenceGroup & {
  clothingImageNumber?: number;
  clothingLabel?: string;
  detailImageNumbers?: number[];
};

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

export function normalizeGarmentDetailGroups(
  value: unknown,
  clothingCount: number,
  max = MAX_GARMENT_DETAIL_IMAGES
): GarmentDetailReferenceGroup[] {
  const safeClothingCount = Math.max(0, Math.floor(Number(clothingCount) || 0));
  if (!safeClothingCount || !Array.isArray(value)) return [];

  const grouped = new Map<number, string[]>();
  const seen = new Set<string>();
  let remaining = Math.max(0, Math.floor(Number(max) || 0));

  for (let index = 0; index < value.length && remaining > 0; index++) {
    const item = value[index];
    let clothingIndex = index;
    let urlsInput: unknown = item;

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      clothingIndex = normalizeClothingIndex(record.clothingIndex ?? record.clothing_index, index);
      urlsInput = record.urls ?? record.detailUrls ?? record.detail_urls ?? record.garmentDetailUrls ?? record.garment_detail_urls;
    }

    if (clothingIndex < 0 || clothingIndex >= safeClothingCount) continue;
    const urls = normalizeGarmentDetailUrls(urlsInput, remaining);
    if (!urls.length) continue;
    const target = grouped.get(clothingIndex) || [];
    for (const url of urls) {
      if (seen.has(url) || remaining <= 0) continue;
      seen.add(url);
      target.push(url);
      remaining -= 1;
    }
    if (target.length) grouped.set(clothingIndex, target);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([clothingIndex, urls]) => ({ clothingIndex, urls }));
}

export function flattenGarmentDetailGroups(groups: GarmentDetailReferenceGroup[] | null | undefined) {
  return normalizeGarmentDetailUrls((groups || []).flatMap((group) => group.urls));
}

export function countGarmentDetailImages(groups: GarmentDetailReferenceGroup[] | null | undefined, unassignedUrls?: unknown) {
  return flattenGarmentDetailGroups(groups).length + normalizeGarmentDetailUrls(unassignedUrls).length;
}

export function buildGarmentDetailReferencePrompt(input: number | {
  groups?: GarmentDetailPromptGroup[];
  unassignedUrls?: string[];
  unassignedImageNumbers?: number[];
  startImageNumber?: number;
}) {
  if (typeof input === "object" && input) {
    const groupedLines = buildGroupedGarmentDetailPrompt(input.groups || []);
    const unassignedLines = buildUnassignedGarmentDetailPrompt(input.unassignedUrls || [], input.unassignedImageNumbers, input.startImageNumber);
    const lines = [...groupedLines, ...unassignedLines];
    if (!lines.length) return "";
    return [
      "服装细节归属规则：",
      ...lines,
      "所有细节图都不是新服装，也不是人物/姿势/背景参考；只做局部真实感恢复。冲突时以对应主服装图为准，不强化、不跨件迁移、不凭空新增纹理、条纹或结构。",
    ].join("\n");
  }

  const safeCount = Math.min(Math.max(Math.floor(Number(input) || 0), 0), MAX_GARMENT_DETAIL_IMAGES);
  if (!safeCount) return "";

  return [
    `服装细节：附加的 ${safeCount} 张图只用于补充当前服装的局部细节（领口、袖口、口袋、纽扣、拉链、背面、侧面等）。`,
    `冲突时以主图为准，只做轻量、局部的真实感恢复，不强化任何纹理、条纹或织法。`,
  ].join("");
}

function buildGroupedGarmentDetailPrompt(groups: GarmentDetailPromptGroup[]) {
  return groups
    .map((group) => {
      const detailRefs = formatImageRefs(group.detailImageNumbers);
      if (!detailRefs) return "";
      const clothingRef = `image ${group.clothingImageNumber || group.clothingIndex + 1}`;
      const label = group.clothingLabel ? `（${group.clothingLabel}）` : "";
      return `${detailRefs} 只补充 ${clothingRef}${label} 的局部细节（面料、领口、袖口、口袋、纽扣、拉链、logo、背面、侧面等），不得用于其他主服装图。`;
    })
    .filter(Boolean);
}

function buildUnassignedGarmentDetailPrompt(urls: string[], imageNumbers?: number[], startImageNumber?: number) {
  const normalized = normalizeGarmentDetailUrls(urls);
  if (!normalized.length) return [];
  const detailRefs = formatImageRefs(imageNumbers) || formatImageRefs(normalized.map((_, index) => (startImageNumber || 1) + index));
  if (!detailRefs) return [];
  return [
    `${detailRefs} 是未归属细节图：仅当它与某一张主服装图的颜色、材质、结构明显对应时，才可轻量补充那一件服装；无法判断归属时直接忽略。`,
  ];
}

function formatImageRefs(numbers?: number[]) {
  const refs = (numbers || [])
    .map((value) => Math.floor(Number(value) || 0))
    .filter((value) => value > 0)
    .map((value) => `image ${value}`);
  if (!refs.length) return "";
  return refs.join("、");
}

function normalizeClothingIndex(value: unknown, fallback: number) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

/**
 * 友商风格主任务模板：把"图编号 ↔ 角色"映射成一句话动作链，模型直接照做。
 * 适用于服装上身（tryon）：图 1 = 参考原图，图 2 = 服装，图 3 = 模特脸，图 4+ = 细节补充。
 */
export function buildTryOnRoleBasedPrompt(params: {
  hasModelFace: boolean;
  detailCount: number;
}) {
  const detailPart = params.detailCount > 0
    ? `图 4 及之后共 ${params.detailCount} 张为图 2 服装的局部细节补充（领口、口袋、纽扣、背面、侧面等），精准还原这些局部特征，不放大任何纹理或条纹。`
    : "";

  const facePart = params.hasModelFace
    ? `2. 把图 3 的面部五官、脸型、骨相、肤色、发型完整移植到图 1。`
    : "";

  return [
    `服装上身：图 1 是参考原图（保留姿势、构图、背景、整体色调不变）。在此基础上完成精准替换：`,
    `1. 把图 2 的服装（版型、长度、颜色、图案、材质）完整替换到图 1 的人物身上；`,
    facePart,
    detailPart,
    `最终输出一张真实自然的融合图：服装是图 2 的${params.hasModelFace ? "，脸是图 3 的" : ""}，姿势和场景是图 1 的。`,
  ].filter(Boolean).join("");
}

/**
 * 友商风格主任务模板：姿势裂变（pose）。
 * 图 1 = 参考人物（保留人物身份），图 2+ = 服装角度参考（可选）。
 * outputMode: grid（自动宫格） / separate（每张独立）。
 */
export function buildPoseRoleBasedPrompt(params: {
  outputMode: "grid" | "separate";
  detailCount: number;
  poseCount: number;
}) {
  const safePoseCount = Math.min(Math.max(Math.floor(Number(params.poseCount) || 4), 1), 8);
  const layoutPart = params.outputMode === "grid"
    ? `最终输出一张包含 ${safePoseCount} 个姿势的自动宫格/pose sheet，每个分格展示一个姿势；不要拆成多张独立图片，不要少格、漏格或拼贴成普通单人照。`
    : `本次调用只输出 1 张独立的单人换姿势图，只展示当前目标姿势；整组任务共 ${safePoseCount} 张，由系统分别调用生成，不要在本张里合成多图。`;

  const detailPart = params.detailCount > 0
    ? `图 2 及之后共 ${params.detailCount} 张为图 1 服装的多角度参考（正面、背面、侧面、平铺/悬挂等），只用于校准同一服装的版型、隐藏面、转身可见面和正背侧结构关系；不得作为新服装、材质增强、人物、姿势、脸、背景或光线参考。`
    : "";
  const actionPart = params.outputMode === "grid"
    ? `在指定的 N 个新姿势下重新生成同一人物的图片，姿势按提示词描述执行，服装款式、颜色、版型必须与图 1 一致；背景、光影和相机质感默认跟随图 1，只有用户明确要求时才自然调整，不要无故改成通用棚拍背景。`
    : `本次只执行当前一个新姿势，重新生成同一人物的一张独立图片；服装款式、颜色、版型必须与图 1 一致；背景、光影和相机质感默认跟随图 1，只有用户明确要求时才自然调整，不要无故改成通用棚拍背景。`;

  return [
    `姿势裂变：图 1 是参考人物（保留人物身份：脸型、五官、骨相、肤色、发型、年龄感、服装款式、版型、颜色、图案）。`,
    actionPart,
    detailPart,
    layoutPart,
  ].filter(Boolean).join("");
}
