/**
 * 本地化数字/日期格式化（客户端组件用）。
 * locale 来源与 next-intl 同步（html lang），并缓存 Intl 实例避免逐行重建。
 * 用法：formatNumber(1234) / formatDateTime("2026-08-15T06:00:00Z")
 */

const numberFormatCache = new Map<string, Intl.NumberFormat>();

/** 读取当前语言（html lang 由根布局随 next-intl locale 输出） */
export function getDocumentLocale() {
  if (typeof document === "undefined") return "zh";
  const lang = document.documentElement.lang || "zh";
  return lang === "zh-CN" ? "zh" : lang;
}

export function formatNumber(value: number, locale = getDocumentLocale()) {
  let formatter = numberFormatCache.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale);
    numberFormatCache.set(locale, formatter);
  }
  return formatter.format(Number(value || 0));
}

export function formatDateTime(value: string | null | undefined, locale = getDocumentLocale()) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date
    .toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(/\//g, "-");
}
