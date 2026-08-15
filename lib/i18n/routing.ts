import { defineRouting } from "next-intl/routing";

/**
 * i18n 路由配置。
 * localePrefix "never"：URL 不带语言前缀（现有链接零改动），
 * 语言由 cookie（用户选择）> Accept-Language（首次访问）决定。
 */
export const routing = defineRouting({
  // 顺序即切换器展示顺序；zh 为默认（中文产品）
  locales: ["zh", "en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt", "ru", "id", "bg", "it", "ar", "vi", "hi", "th", "tr"],
  defaultLocale: "zh",
  localePrefix: "never",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];
