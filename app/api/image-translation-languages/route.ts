import { NextResponse } from "next/server";
import type {
  ImageTranslationLanguageConfig,
} from "@/lib/image-translation";

/**
 * GET /api/image-translation-languages
 *
 * 返回图片翻译模块使用的语种分组数据，用于"目标语言"弹框。
 * - 优先从 IMAGE_TRANSLATION_LANGUAGES_URL（上游字典服务）拉取并缓存 1 小时；
 * - 失败/未配置时使用内置的兜底数据（欧美/亚洲/非洲/其他常用语种）。
 */

const FALLBACK_LANGUAGE_CONFIG: ImageTranslationLanguageConfig = [
  {
    label: "欧美",
    enLabel: "",
    isCommon: false,
    sort: 1,
    children: [
      [
        { label: "英语", enLabel: "English", isCommon: true, sort: 1 },
        { label: "英语（美国）", enLabel: "English (US)", isCommon: false, sort: 2 },
        { label: "英语（英国）", enLabel: "English (UK)", isCommon: false, sort: 3 },
        { label: "英语（加拿大）", enLabel: "English (Canada)", isCommon: false, sort: 4 },
        { label: "英语（澳大利亚）", enLabel: "English (Australia)", isCommon: false, sort: 5 },
        { label: "英语（新西兰）", enLabel: "English (New Zealand)", isCommon: false, sort: 6 },
        { label: "英语（爱尔兰）", enLabel: "English (Ireland)", isCommon: false, sort: 7 },
        { label: "英语（南非）", enLabel: "English (South Africa)", isCommon: false, sort: 8 },
        { label: "英语（印度）", enLabel: "English (India)", isCommon: false, sort: 9 },
      ],
      [
        { label: "西班牙语", enLabel: "Español", isCommon: true, sort: 1 },
        { label: "西班牙语（西班牙）", enLabel: "Español (España)", isCommon: false, sort: 2 },
        { label: "西班牙语（拉丁美洲）", enLabel: "Español (Latinoamérica)", isCommon: false, sort: 3 },
        { label: "西班牙语（墨西哥）", enLabel: "Español (México)", isCommon: false, sort: 4 },
        { label: "西班牙语（阿根廷）", enLabel: "Español (Argentina)", isCommon: false, sort: 5 },
      ],
      [
        { label: "葡萄牙语", enLabel: "Português", isCommon: true, sort: 1 },
        { label: "葡萄牙语（巴西）", enLabel: "Português (Brasil)", isCommon: false, sort: 2 },
        { label: "葡萄牙语（葡萄牙）", enLabel: "Português (Portugal)", isCommon: false, sort: 3 },
      ],
      [
        { label: "法语", enLabel: "Français", isCommon: true, sort: 1 },
        { label: "法语（法国）", enLabel: "Français (France)", isCommon: false, sort: 2 },
        { label: "法语（加拿大）", enLabel: "Français (Canada)", isCommon: false, sort: 3 },
        { label: "法语（瑞士）", enLabel: "Français (Suisse)", isCommon: false, sort: 4 },
      ],
      [
        { label: "德语", enLabel: "Deutsch", isCommon: true, sort: 1 },
        { label: "德语（德国）", enLabel: "Deutsch (Deutschland)", isCommon: false, sort: 2 },
        { label: "德语（奥地利）", enLabel: "Deutsch (Österreich)", isCommon: false, sort: 3 },
        { label: "德语（瑞士）", enLabel: "Deutsch (Schweiz)", isCommon: false, sort: 4 },
      ],
      [
        { label: "意大利语", enLabel: "Italiano", isCommon: true, sort: 1 },
        { label: "意大利语（意大利）", enLabel: "Italiano (Italia)", isCommon: false, sort: 2 },
        { label: "意大利语（瑞士）", enLabel: "Italiano (Svizzera)", isCommon: false, sort: 3 },
      ],
      [
        { label: "荷兰语", enLabel: "Nederlands", isCommon: false, sort: 1 },
        { label: "波兰语", enLabel: "Polski", isCommon: false, sort: 1 },
        { label: "捷克语", enLabel: "Čeština", isCommon: false, sort: 1 },
        { label: "瑞典语", enLabel: "Svenska", isCommon: false, sort: 1 },
        { label: "丹麦语", enLabel: "Dansk", isCommon: false, sort: 1 },
        { label: "芬兰语", enLabel: "Suomi", isCommon: false, sort: 1 },
        { label: "挪威语", enLabel: "Norsk", isCommon: false, sort: 1 },
        { label: "希腊语", enLabel: "Ελληνικά", isCommon: false, sort: 1 },
        { label: "匈牙利语", enLabel: "Magyar", isCommon: false, sort: 1 },
        { label: "罗马尼亚语", enLabel: "Română", isCommon: false, sort: 1 },
        { label: "俄语", enLabel: "Русский", isCommon: false, sort: 1 },
        { label: "乌克兰语", enLabel: "Українська", isCommon: false, sort: 1 },
      ],
    ],
  },
  {
    label: "亚洲",
    enLabel: "",
    isCommon: false,
    sort: 2,
    children: [
      [
        { label: "中文", enLabel: "中文", isCommon: false, sort: 1 },
        { label: "中文（简体）", enLabel: "中文（简体）", isCommon: true, sort: 2 },
        { label: "中文（香港繁体）", enLabel: "中文（香港）", isCommon: false, sort: 3 },
        { label: "中文（台湾繁体）", enLabel: "中文（台灣）", isCommon: false, sort: 4 },
      ],
      [
        { label: "日语", enLabel: "日本語", isCommon: true, sort: 1 },
        { label: "韩语", enLabel: "한국어", isCommon: true, sort: 1 },
        { label: "越南语", enLabel: "Tiếng Việt", isCommon: true, sort: 1 },
        { label: "泰语", enLabel: "ไทย", isCommon: false, sort: 1 },
        { label: "印尼语", enLabel: "Indonesia", isCommon: true, sort: 1 },
        { label: "马来语", enLabel: "Bahasa Melayu", isCommon: false, sort: 1 },
      ],
      [
        { label: "印地语", enLabel: "हिन्दी", isCommon: true, sort: 1 },
        { label: "孟加拉语", enLabel: "বাংলা", isCommon: false, sort: 1 },
        { label: "泰米尔语", enLabel: "தமிழ்", isCommon: false, sort: 1 },
        { label: "泰卢固语", enLabel: "తెలుగు", isCommon: false, sort: 1 },
        { label: "古吉拉特语", enLabel: "ગુજરાતી", isCommon: false, sort: 1 },
      ],
      [
        { label: "阿拉伯语", enLabel: "العربية", isCommon: true, sort: 1 },
        { label: "希伯来语", enLabel: "עברית", isCommon: false, sort: 1 },
        { label: "波斯语", enLabel: "فارسی", isCommon: false, sort: 1 },
        { label: "土耳其语", enLabel: "Türkçe", isCommon: false, sort: 1 },
      ],
    ],
  },
  {
    label: "非洲",
    enLabel: "",
    isCommon: false,
    sort: 3,
    children: [
      [
        { label: "南非荷兰语", enLabel: "Afrikaans", isCommon: false, sort: 1 },
        { label: "斯瓦希里语", enLabel: "Kiswahili", isCommon: false, sort: 1 },
        { label: "豪萨语", enLabel: "Hausa", isCommon: false, sort: 1 },
        { label: "祖鲁语", enLabel: "isiZulu", isCommon: false, sort: 1 },
        { label: "阿姆哈拉语", enLabel: "አማርኛ", isCommon: false, sort: 1 },
      ],
    ],
  },
  {
    label: "其他",
    enLabel: "",
    isCommon: false,
    sort: 4,
    children: [
      [
        { label: "世界语", enLabel: "Esperanto", isCommon: false, sort: 1 },
        { label: "拉丁语", enLabel: "Latina", isCommon: false, sort: 1 },
      ],
    ],
  },
];

type CachedPayload = {
  fetchedAt: number;
  config: ImageTranslationLanguageConfig;
};

let cache: CachedPayload | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchFromUpstream(): Promise<ImageTranslationLanguageConfig | null> {
  const upstreamUrl = process.env.IMAGE_TRANSLATION_LANGUAGES_URL;
  if (!upstreamUrl) return null;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = process.env.IMAGE_TRANSLATION_LANGUAGES_TOKEN;
    if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      data?: unknown;
      succ?: boolean;
      code?: number;
    };
    const payload = (raw?.data ?? raw) as unknown;
    if (!Array.isArray(payload)) return null;
    return payload as ImageTranslationLanguageConfig;
  } catch (error) {
    console.warn("[image-translation-languages] upstream fetch failed:", error instanceof Error ? error.message : error);
    return null;
  }
}


export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt >= CACHE_TTL_MS) {
    const upstream = await fetchFromUpstream();
    cache = {
      fetchedAt: now,
      config: upstream ?? FALLBACK_LANGUAGE_CONFIG,
    };
  }
  return NextResponse.json(
    {
      data: cache.config,
      source: process.env.IMAGE_TRANSLATION_LANGUAGES_URL && cache.config !== FALLBACK_LANGUAGE_CONFIG ? "upstream" : "fallback",
      cachedAt: cache.fetchedAt,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
      },
    }
  );
}
