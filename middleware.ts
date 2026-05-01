import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // 不在中间件层做认证跳转，交给各页面自己处理
  // 只做最基本的请求转发
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
