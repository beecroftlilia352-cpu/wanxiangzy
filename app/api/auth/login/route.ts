import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const LOGIN_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

    const supabase = await createServerSupabase({
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });

    const { data, error } = await supabase.auth
      .signInWithPassword({ email, password })
      .finally(() => clearTimeout(timeout));

    if (error) {
      if (isAbortError(error.message)) {
        return NextResponse.json({ error: "登录服务暂时不可用，请稍后重试" }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: data.user?.id ?? null,
        email: data.user?.email ?? email,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name !== "AbortError" && !isAbortError(err.message)
        ? err.message
        : "登录服务暂时不可用，请稍后重试";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

function isAbortError(message: string) {
  return /aborted|aborterror/i.test(message);
}
