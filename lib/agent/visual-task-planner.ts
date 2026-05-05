import type { AspectRatio } from "@/lib/api/lingya";

export type CommerceIntentKind = "detail" | "creative" | null;
export type AgentModuleConstraint = "tryon" | "grass" | "pose" | "model_background" | "model" | "garment_3d";

const DETAIL_PAGE_RE =
  /详情页|商品详情|电商详情|产品详情|详情长图|落地页|长图|卖点图|参数图|功能图|细节图|规格图|对比图|安装图|使用步骤图|详情设计/;
const PLATFORM_DETAIL_RE =
  /(淘宝|天猫|京东|1688|拼多多|抖店|亚马逊).{0,10}(详情|详情页|商品页|产品页|落地页|长图|页面|版式|排版)/;
const CREATIVE_RE =
  /主图|电商主图|首图|封面图|banner|横幅|海报|活动图|推广图|广告图|产品页首屏|焦点图|入口图/iu;

export function getCommerceIntentKind(text: string): CommerceIntentKind {
  const value = text.trim();
  if (!value) return null;
  if (DETAIL_PAGE_RE.test(value) || PLATFORM_DETAIL_RE.test(value)) return "detail";
  if (CREATIVE_RE.test(value)) return "creative";
  return null;
}

export function getCommerceCreativeAspectRatio(text: string): AspectRatio {
  if (/banner|横版|横图|横幅|焦点图/i.test(text)) return "16:9";
  if (/主图|电商主图|首图|封面图/.test(text)) return "1:1";
  return "3:4";
}

export function explainCommerceIntent(text: string): string | null {
  const kind = getCommerceIntentKind(text);
  if (kind === "detail") return "命中电商详情页、长图、卖点/参数/功能分区等版式意图。";
  if (kind === "creative") return "命中主图、banner、海报、活动图等电商视觉意图。";
  return null;
}

export function getForbiddenAgentModules(text: string): AgentModuleConstraint[] {
  const value = text.trim();
  if (!value) return [];

  const rules: Array<[AgentModuleConstraint, RegExp]> = [
    ["grass", /(?:不要|别|不做|不是|无需|别做|不要做|不要生成|不要变成|不能是|避免|拒绝).{0,12}(种草|小红书|街拍|生活方式|ootd)|(?:种草|小红书|街拍|生活方式|ootd).{0,8}(不要|别|不做|不是|无需|避免)/i],
    ["tryon", /(?:不要|别|不做|不是|无需|别做|不要做|不要生成|不要变成|不能是|避免).{0,12}(换装|上身|试穿|穿到|穿上)|(?:换装|上身|试穿|穿到|穿上).{0,8}(不要|别|不做|不是|无需|避免)/],
    ["pose", /(?:不要|别|不做|不是|无需|别做|不要做|不要生成|不要变成|不能是|避免).{0,12}(姿势|四宫格|pose)|(?:姿势|四宫格|pose).{0,8}(不要|别|不做|不是|无需|避免)/i],
    ["model_background", /(?:不要|别|不做|不是|无需|别做|不要做|不要生成|不要变成|不能是|避免).{0,12}(换背景|换场景|换模特)|(?:换背景|换场景|换模特).{0,8}(不要|别|不做|不是|无需|避免)/],
    ["model", /(?:不要|别|不做|不是|无需|别做|不要做|不要生成|不要变成|不能是|避免).{0,12}(专属模特|建模特|定制脸)|(?:专属模特|建模特|定制脸).{0,8}(不要|别|不做|不是|无需|避免)/],
    ["garment_3d", /(?:不要|别|不做|不是|无需|别做|不要做|不要生成|不要变成|不能是|避免).{0,12}(3d|3D|立体)|(?:3d|3D|立体).{0,8}(不要|别|不做|不是|无需|避免)/],
  ];

  return rules.filter(([, pattern]) => pattern.test(value)).map(([module]) => module);
}

export function getUserBoundaryLines(text: string): string[] {
  const forbidden = getForbiddenAgentModules(text);
  const labels: Record<AgentModuleConstraint, string> = {
    grass: "不要把任务改成小红书种草、街拍或生活方式内容图。",
    tryon: "不要把任务改成换装、上身或试穿流程。",
    pose: "不要把任务改成姿势裂变或四宫格。",
    model_background: "不要把任务改成换背景、换场景或换模特。",
    model: "不要把任务改成专属模特或定制脸。",
    garment_3d: "不要把任务改成 3D 立体展示。",
  };
  return forbidden.map((module) => labels[module]);
}
