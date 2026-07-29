import { NextResponse } from "next/server";
import type { ImageTranslationExampleConfig } from "@/lib/image-translation";

/**
 * GET /api/image-translation-resources
 *
 * 返回图片翻译"试一试"推荐示例图（dicType = PIC_CASE_IMG_TRANSLATE）。
 * - 优先从 IMAGE_TRANSLATION_RESOURCES_URL 拉取上游字典资源；
 * - 失败时使用内置兜底示例（与生产附件 4 数据一致）。
 */

const FALLBACK_RESOURCE_CONFIG: ImageTranslationExampleConfig = [
  {
    picUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg",
    title: "推荐示例 1",
    thumbUrl:
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg?x-oss-process=image/resize,h_512",
    thumbs: {
      "h_2048":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg?x-oss-process=image/resize,h_2048",
      "h_192":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg?x-oss-process=image/resize,h_192",
      "l_1024":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg?x-oss-process=image/resize,l_1024",
      "h_512":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/01.jpg?x-oss-process=image/resize,h_512",
    },
  },
  {
    picUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg",
    title: "推荐示例 2",
    thumbUrl:
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg?x-oss-process=image/resize,h_512",
    thumbs: {
      "h_2048":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg?x-oss-process=image/resize,h_2048",
      "h_192":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg?x-oss-process=image/resize,h_192",
      "l_1024":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg?x-oss-process=image/resize,l_1024",
      "h_512":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/02.jpg?x-oss-process=image/resize,h_512",
    },
  },
  {
    picUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg",
    title: "推荐示例 3",
    thumbUrl:
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg?x-oss-process=image/resize,h_512",
    thumbs: {
      "h_2048":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg?x-oss-process=image/resize,h_2048",
      "h_192":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg?x-oss-process=image/resize,h_192",
      "l_1024":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg?x-oss-process=image/resize,l_1024",
      "h_512":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/03.jpg?x-oss-process=image/resize,h_512",
    },
  },
  {
    picUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg",
    title: "推荐示例 4",
    thumbUrl:
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg?x-oss-process=image/resize,h_512",
    thumbs: {
      "h_2048":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg?x-oss-process=image/resize,h_2048",
      "h_192":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg?x-oss-process=image/resize,h_192",
      "l_1024":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg?x-oss-process=image/resize,l_1024",
      "h_512":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/04.jpg?x-oss-process=image/resize,h_512",
    },
  },
  {
    picUrl: "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg",
    title: "推荐示例 5",
    thumbUrl:
      "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg?x-oss-process=image/resize,h_512",
    thumbs: {
      "h_2048":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg?x-oss-process=image/resize,h_2048",
      "h_192":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg?x-oss-process=image/resize,h_192",
      "l_1024":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg?x-oss-process=image/resize,l_1024",
      "h_512":
        "https://metac-open.oss-cn-hangzhou.aliyuncs.com/marketing/prod/2.9.4/img_translate/pic_case/05.jpg?x-oss-process=image/resize,h_512",
    },
  },
];

type CachedPayload = {
  fetchedAt: number;
  config: ImageTranslationExampleConfig;
};

let cache: CachedPayload | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchFromUpstream(): Promise<ImageTranslationExampleConfig | null> {
  const upstreamUrl = process.env.IMAGE_TRANSLATION_RESOURCES_URL;
  if (!upstreamUrl) return null;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = process.env.IMAGE_TRANSLATION_RESOURCES_TOKEN;
    if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as { data?: unknown; succ?: boolean; code?: number };
    const payload = raw?.data ?? raw;
    if (!Array.isArray(payload)) return null;
    return payload as ImageTranslationExampleConfig;
  } catch (error) {
    console.warn("[image-translation-resources] upstream fetch failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt >= CACHE_TTL_MS) {
    const upstream = await fetchFromUpstream();
    cache = {
      fetchedAt: now,
      config: upstream ?? FALLBACK_RESOURCE_CONFIG,
    };
  }
  return NextResponse.json(
    {
      data: cache.config,
      source:
        process.env.IMAGE_TRANSLATION_RESOURCES_URL && cache.config !== FALLBACK_RESOURCE_CONFIG
          ? "upstream"
          : "fallback",
      cachedAt: cache.fetchedAt,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
      },
    }
  );
}
