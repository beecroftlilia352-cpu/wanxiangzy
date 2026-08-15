import { type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Supabase 会话检查（受保护路径未登录时重定向到 /login）
  const sessionResponse = await updateSession(request);

  // 2. i18n：协商 locale（cookie > Accept-Language）并把 X-NEXT-INTL-LOCALE
  //    头挂到它返回的响应上 —— 该响应必须作为最终响应返回，SSR 才能读到 locale。
  const intlResponse = intlMiddleware(request);

  // 会话重定向时：把 i18n 协商出的 cookie 带到重定向响应上，其余情况返回 intl 响应
  if (sessionResponse.headers.has("location")) {
    for (const cookie of intlResponse.headers.getSetCookie()) {
      sessionResponse.headers.append("Set-Cookie", cookie);
    }
    return sessionResponse;
  }

  return intlResponse;
}

export const config = {
  matcher: [
    // /api 路由由各自处理器负责鉴权与响应（如 /api/locale 自己写 cookie），
    // 中间件只处理页面渲染所需的 locale 协商与会话重定向。
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
