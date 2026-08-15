import { NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";

const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 语言切换：写入 NEXT_LOCALE cookie（有效期一年），刷新后全站生效 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { locale?: unknown };
  const locale = typeof body.locale === "string" ? body.locale : "";

  if (!hasLocale(routing.locales, locale)) {
    return NextResponse.json({ error: "unsupported locale" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
  return response;
}
