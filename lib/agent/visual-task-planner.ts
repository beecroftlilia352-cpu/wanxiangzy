import type { AspectRatio } from "@/lib/api/lingya";

export type CommerceIntentKind = "detail" | "creative" | null;

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
