/**
 * LLM 输出语言本地化：
 * middleware 已把协商出的 locale 写入 X-NEXT-INTL-LOCALE 请求头，
 * 服务端 API 用它拼"输出语言"指令，让 AI 识别/分析/帮写结果跟随用户界面语言。
 */

const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
  zh: "中文",
  en: "English",
  "zh-TW": "繁体中文",
  ja: "日本語",
  ko: "한국어",
  fr: "français",
  de: "Deutsch",
  es: "español",
  pt: "português",
  ru: "русский",
  id: "Bahasa Indonesia",
  bg: "български",
  it: "italiano",
  ar: "العربية",
  vi: "Tiếng Việt",
  hi: "हिन्दी",
  th: "ไทย",
  tr: "Türkçe",
};

export function getLlmLanguageName(locale: string | null | undefined): string {
  return LOCALE_LANGUAGE_NAMES[locale || "zh"] || LOCALE_LANGUAGE_NAMES.zh;
}
