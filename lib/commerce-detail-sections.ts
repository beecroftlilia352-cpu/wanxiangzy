import type { AspectRatio } from "@/lib/api/lingya";

export type CommerceDetailLayout = "mobile" | "desktop";

export type CommerceDetailSectionSpec = {
  id: string;
  title: string;
  purpose: string;
  template: string;
  avoid: string[];
};

const BASE_SECTIONS: CommerceDetailSectionSpec[] = [
  {
    id: "hero",
    title: "首屏主视觉",
    purpose: "建立商品第一印象、品类定位和核心一句话卖点。",
    template:
      "Large mobile hero section: one strong product or model hero visual, one short headline, one subheadline, 2-3 compact benefit badges. Keep it airy and premium.",
    avoid: ["specification table", "material macro grid", "full detail page", "many tiny thumbnails"],
  },
  {
    id: "benefits",
    title: "核心卖点",
    purpose: "用 3-4 个清晰卖点说明用户为什么要买。",
    template:
      "Benefit-card section: 3-4 large readable selling-point cards with simple icons or close-up crops, each card has one short title and one short sentence.",
    avoid: ["repeat hero layout", "full-page product story", "dense parameter table"],
  },
  {
    id: "material",
    title: "材质细节",
    purpose: "展示面料、工艺、纹理、边缘、扣件、走线或版型细节。",
    template:
      "Material/detail section: macro close-ups, fabric texture blocks, craftsmanship callouts, neat labels and arrows. The visual focus is detail quality, not the full model.",
    avoid: ["large hero-only composition", "price promotion", "complete size chart"],
  },
  {
    id: "fit_scene",
    title: "上身场景",
    purpose: "展示穿着效果、廓形、场景氛围或搭配建议。",
    template:
      "Fit/lifestyle section: one model or product-in-use visual, fit notes, styling suggestions, silhouette callouts. Keep it mobile and spacious.",
    avoid: ["material-only macro layout", "full specification table", "repeat first hero exactly"],
  },
  {
    id: "specs",
    title: "参数尺码",
    purpose: "清楚呈现尺寸、规格、洗护、颜色或购买前需要确认的信息。",
    template:
      "Specs section: simplified mobile cards or a very small readable table, only the most important parameters, large typography, strong hierarchy.",
    avoid: ["tiny PC spreadsheet", "too many columns", "hero poster layout"],
  },
  {
    id: "comparison",
    title: "优势对比",
    purpose: "通过对比结构强化商品优势、升级点或痛点解决。",
    template:
      "Comparison section: before/after or ordinary vs upgraded comparison, 2-column mobile-friendly cards, short direct copy.",
    avoid: ["dense long paragraphs", "full-detail-page collage", "unrelated lifestyle scene"],
  },
  {
    id: "trust",
    title: "品质信任",
    purpose: "增强品质感、服务承诺、真实细节和购买信任。",
    template:
      "Trust section: quality proof, detail close-up, service badges, real-product assurance, clean commercial layout.",
    avoid: ["repeat benefits card exactly", "oversized hero only", "crowded certification wall"],
  },
  {
    id: "closing",
    title: "收尾转化",
    purpose: "做最后的购买理由、搭配总结、系列感收尾或行动引导。",
    template:
      "Closing conversion section: elegant summary visual, final hook, recommended pairing or color options, concise CTA-style ending.",
    avoid: ["new unrelated product", "full page containing all modules", "tiny dense copy"],
  },
];

export function buildCommerceDetailSections(count: number): CommerceDetailSectionSpec[] {
  const safeCount = Math.min(Math.max(Math.floor(Number(count) || 1), 1), 8);
  return Array.from({ length: safeCount }, (_, index) => BASE_SECTIONS[index % BASE_SECTIONS.length]);
}

export function normalizeCommerceDetailLayout(value: unknown): CommerceDetailLayout {
  return String(value || "").toLowerCase() === "desktop" ? "desktop" : "mobile";
}

export function resolveCommerceDetailAspectRatio(layout: CommerceDetailLayout, requested: AspectRatio): AspectRatio {
  if (layout === "desktop") return requested;
  return requested === "auto" || requested === "1:1" ? "9:16" : requested;
}

export function buildCommerceDetailSectionPrompt(params: {
  userPrompt: string;
  platform?: string;
  layout?: CommerceDetailLayout;
  mobileWidth?: number;
  section: CommerceDetailSectionSpec;
  sectionIndex: number;
  sectionTotal: number;
  referenceCount?: number;
}) {
  const platform = params.platform?.trim() || "通用电商平台";
  const layout = params.layout || "mobile";
  const mobileWidth = Number(params.mobileWidth || 750);
  const layoutRule = layout === "desktop"
    ? "Layout: desktop/web detail module, spacious commercial composition, readable hierarchy."
    : `Layout: mobile-first commerce detail module, ${mobileWidth}px mobile detail-page style, vertical one-screen section, large readable Chinese typography, generous spacing.`;

  return [
    "ROLE: Senior e-commerce art director and mobile detail-page designer.",
    `USER GOAL: ${params.userPrompt || "Create commerce detail page modules from the reference image."}`,
    `PLATFORM: ${platform}. ${getCommercePlatformTone(platform)}`,
    `REFERENCE IMAGES: ${params.referenceCount || 0} image(s). Preserve the product/person/garment identity, color, material, silhouette and commercial photography quality from the references.`,
    "",
    "OUTPUT CONTRACT:",
    `- Generate exactly ONE independent detail-page section image: section ${params.sectionIndex}/${params.sectionTotal}.`,
    `- Section title: ${params.section.title}.`,
    `- Section purpose: ${params.section.purpose}`,
    `- Section template: ${params.section.template}`,
    "- This call is NOT asking for a complete detail page.",
    "- Do NOT include all modules in one image.",
    "- Do NOT create a full long page, collage, four-grid, contact sheet, or repeated complete page variant.",
    "- Do NOT copy the same hero + icons + table structure used by other sections.",
    `- Avoid in this section: ${params.section.avoid.join("; ")}.`,
    "",
    layoutRule,
    "Copywriting: short Chinese copy, large enough to read on mobile, no dense PC-style tables unless this section is specifically specs/parameters.",
    "Visual style: clean commercial e-commerce design, strong hierarchy, premium product presentation, realistic product details.",
    "Consistency: keep referenced subject stable; change only layout, module content and visual organization for this section.",
  ].join("\n");
}

function getCommercePlatformTone(platform: string) {
  const normalized = platform.toLowerCase();
  if (/xiaohongshu|red|小红书/.test(normalized)) return "Tone: useful content-commerce, natural but still structured.";
  if (/douyin|tiktok|抖音/.test(normalized)) return "Tone: strong hook, quick scanning, mobile conversion.";
  if (/pdd|pinduoduo|拼多多/.test(normalized)) return "Tone: direct value proposition, clear benefits, high readability.";
  if (/taobao|tmall|淘宝|天猫/.test(normalized)) return "Tone: Taobao/Tmall product story, premium and readable.";
  if (/jd|jingdong|京东/.test(normalized)) return "Tone: trustworthy specs, clean structure, precise benefits.";
  return "Tone: universal marketplace detail-page module.";
}
