// next-intl 构建期插件默认在 i18n/request.ts 查找配置。
// 此处必须自包含（相对导入），插件加载器不解析 tsconfig 路径别名。
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "../lib/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
