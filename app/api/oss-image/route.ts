import { NextResponse } from "next/server";
import { createSignedOssVariantUrl, OSS_VARIANT_PIPELINES } from "@/lib/api/oss-variant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOST_RE =
  /^([a-z0-9-]+\.)?aliyuncs\.com$/i;

type RouteContext = { params: Promise<Record<string, never>> };

export async function GET(request: Request, _ctx: RouteContext) {
  const url = new URL(request.url);
  const src = url.searchParams.get("src");
  const variant = url.searchParams.get("variant") ?? "thumb";

  if (!src) {
    return NextResponse.json({ error: "missing src" }, { status: 400 });
  }
  if (!(variant in OSS_VARIANT_PIPELINES)) {
    return NextResponse.json(
      { error: `unsupported variant: ${variant}` },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ error: "invalid src url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "non-http(s) src" }, { status: 400 });
  }
  if (!ALLOWED_HOST_RE.test(parsed.hostname)) {
    return NextResponse.json(
      { error: `disallowed host: ${parsed.hostname}` },
      { status: 400 },
    );
  }

  try {
    const signed = createSignedOssVariantUrl(parsed, variant);
    return NextResponse.redirect(signed, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=300",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sign failed" },
      { status: 503 },
    );
  }
}
