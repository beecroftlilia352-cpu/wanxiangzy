import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const localeCookie = typeof routing.localeCookie === "object" && routing.localeCookie ? routing.localeCookie : { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365 };
const LOCALE_COOKIE: string = localeCookie.name || "NEXT_LOCALE";
const LOCALES: Set<string> = new Set(routing.locales);

/**
 * 轻量 locale 协商（不使用 next-intl 的 createMiddleware）：
 * next-intl 的 middleware 会把请求 rewrite 到 /[locale] 内部路径，
 * 而本项目是无前缀路由（无 app/[locale] 段），rewrite 会导致全站 404。
 * 这里只做：cookie > Accept-Language 协商，并把结果写进
 * X-NEXT-INTL-LOCALE 请求头（next-intl 的 getRequestConfig 读取它）。
 */
function negotiateLocale(request: NextRequest): string {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value ?? "";
  if (cookie && LOCALES.has(cookie)) return cookie;

  const header = request.headers.get("accept-language") || "";
  // 按 q 权重取第一个受支持的语言
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = parseFloat(params.find((p) => p.trim().startsWith("q="))?.slice(2) || "1");
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    if (!tag || tag === "*") continue;
    if (LOCALES.has(tag)) return tag;
    // 处理 zh-CN -> zh、zh-TW 等地区子标签
    const base = tag.split("-")[0];
    if (LOCALES.has(base)) return base;
  }

  return routing.defaultLocale;
}

export async function middleware(request: NextRequest) {
  // 1. Supabase 会话检查（受保护路径未登录时重定向到 /login）
  const sessionResponse = await updateSession(request);

  // 2. 协商 locale 并写入请求头；首次访问（无 cookie）同时下发 cookie
  const locale = negotiateLocale(request);
  const headers = new Headers(request.headers);
  headers.set("X-NEXT-INTL-LOCALE", locale);

  const response =
    sessionResponse.headers.has("location")
      ? sessionResponse
      : NextResponse.next({ request: { headers } });

  if (!request.cookies.get(LOCALE_COOKIE)) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: localeCookie.maxAge,
    });
  }

  return response;
}

export const config = {
  matcher: [
    // /api 路由由各自处理器负责鉴权与响应（如 /api/locale 自己写 cookie）
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
