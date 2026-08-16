import type { OutfitFusionAsset, OutfitFusionAssetRole } from "@/lib/outfit-fusion";

/**
 * 根据生成数量返回 Result 卡片网格的 grid-cols / max-w 组合。
 *
 * - 1 张：手机尺寸单列
 * - 2 张：sm 双列
 * - 3 张：sm 三列
 * - 4+ 张：sm 双列 / lg 四列
 */
export function getOutfitFusionTaskGridClass(count: number): string {
  if (count <= 1) return "max-w-[min(340px,100%)] grid-cols-1";
  if (count === 2) return "max-w-[min(700px,100%)] grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-[min(1048px,100%)] grid-cols-1 sm:grid-cols-3";
  return "max-w-[min(1396px,100%)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

/**
 * 把 asset.role 映射到 i18n key（OutfitFusion.roles.*）。
 */
export function getOutfitFusionRoleLabelKey(role: OutfitFusionAssetRole): string {
  if (role === "reference") return "roles.reference";
  if (role === "model") return "roles.model";
  return "roles.outfit";
}

/**
 * 给单张资产一个中文短标签（"参考图1" / "模特图1" / "搭配图1"）。
 */
export function getIndexedAssetLabel(asset: Pick<OutfitFusionAsset, "role">, index: number): string {
  if (asset.role === "reference") return `参考图${index + 1}`;
  if (asset.role === "model") return `模特图${index + 1}`;
  return `搭配图${index + 1}`;
}
