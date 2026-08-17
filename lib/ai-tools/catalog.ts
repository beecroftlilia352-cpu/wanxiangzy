import {
  AI_TOOL_SLUGS,
  type AiToolCatalogEntry,
  type AiToolSlug,
} from "@/lib/ai-tools/types";

export { AI_TOOL_SLUGS, isAiToolSlug } from "@/lib/ai-tools/types";
export type { AiToolSlug } from "@/lib/ai-tools/types";

export const AI_TOOL_ROUTE_BY_OPERATION = {
  matting: "matting",
  upscale: "upscale",
  outpaint: "outpaint",
  erase: "erase",
  "repair-limbs": "hand-foot-repair",
  "repair-garment": "clothing-repair",
  "repair-footwear": "shoe-repair",
  resize: "resize",
} as const satisfies Record<AiToolSlug, string>;

export const AI_TOOL_ROUTE_SLUGS = AI_TOOL_SLUGS.map(
  (operation) => AI_TOOL_ROUTE_BY_OPERATION[operation],
) as Array<(typeof AI_TOOL_ROUTE_BY_OPERATION)[AiToolSlug]>;

export type AiToolRouteSlug = (typeof AI_TOOL_ROUTE_BY_OPERATION)[AiToolSlug];

export const AI_TOOL_CATALOG = {
  matting: {
    slug: "matting",
    label: "AI抠图",
    description: "精确分离人物、商品或服饰，输出透明背景图片",
    provider: "aliyun-segmentation",
    capability: "segment",
    requiresMask: false,
    acceptsMask: false,
    maxImages: 1,
    outputFormats: ["png", "webp"],
  },
  upscale: {
    slug: "upscale",
    label: "图片超清",
    description: "提升图片分辨率与可见细节，保持主体内容稳定",
    provider: "aliyun-image-enhancement",
    capability: "upscale",
    requiresMask: false,
    acceptsMask: false,
    maxImages: 1,
    outputFormats: ["png", "jpeg", "webp"],
  },
  outpaint: {
    slug: "outpaint",
    label: "AI扩图",
    description: "向画面外延展场景，原图区域保持不变",
    provider: "generative-image-edit",
    capability: "outpaint",
    requiresMask: false,
    acceptsMask: false,
    maxImages: 1,
    outputFormats: ["png", "jpeg", "webp"],
  },
  erase: {
    slug: "erase",
    label: "AI消除",
    description: "擦除选中对象并自然补全背景",
    provider: "generative-image-edit",
    capability: "inpaint",
    requiresMask: true,
    acceptsMask: true,
    maxImages: 1,
    outputFormats: ["png", "jpeg", "webp"],
  },
  "repair-limbs": {
    slug: "repair-limbs",
    label: "手脚修复",
    description: "按选区修复手脚结构，保持人物身份与姿态",
    provider: "generative-image-edit",
    capability: "inpaint",
    requiresMask: true,
    acceptsMask: true,
    maxImages: 1,
    outputFormats: ["png", "jpeg", "webp"],
  },
  "repair-garment": {
    slug: "repair-garment",
    label: "服饰修复",
    description: "修复服饰局部材质与结构，可加入一张细节参考图",
    provider: "generative-image-edit",
    capability: "inpaint",
    requiresMask: true,
    acceptsMask: true,
    maxImages: 2,
    outputFormats: ["png", "jpeg", "webp"],
  },
  "repair-footwear": {
    slug: "repair-footwear",
    label: "鞋靴修复",
    description: "修复鞋靴局部结构与材质，可加入一张细节参考图",
    provider: "generative-image-edit",
    capability: "inpaint",
    requiresMask: true,
    acceptsMask: true,
    maxImages: 2,
    outputFormats: ["png", "jpeg", "webp"],
  },
  resize: {
    slug: "resize",
    label: "无损改尺寸",
    description: "高质量调整宽高与适配方式，不使用生成模型重绘内容",
    provider: "sharp",
    capability: "resize",
    requiresMask: false,
    acceptsMask: false,
    maxImages: 1,
    outputFormats: ["png", "jpeg", "webp"],
  },
} as const satisfies Record<AiToolSlug, AiToolCatalogEntry>;

export const AI_TOOL_CATALOG_LIST = AI_TOOL_SLUGS.map((slug) => AI_TOOL_CATALOG[slug]);

export function getAiToolCatalogEntry(slug: AiToolSlug) {
  return AI_TOOL_CATALOG[slug];
}

export function getAiToolRouteSlug(operation: AiToolSlug): AiToolRouteSlug {
  return AI_TOOL_ROUTE_BY_OPERATION[operation];
}

export function getAiToolPath(operation: AiToolSlug) {
  return `/ai-tools/${getAiToolRouteSlug(operation)}`;
}
