import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminForbiddenPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f9fc] px-4 text-codex-ink">
      <div className="w-full max-w-md rounded-lg border border-[var(--codex-border)] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-black text-codex-ink">没有后台访问权限</h1>
        <p className="mt-2 text-sm leading-6 text-codex-muted">
          当前账号没有 admin_members 权限，或未配置 ADMIN_BOOTSTRAP_EMAILS 引导管理员。
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/create"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-codex-ink px-4 text-sm font-black text-white"
          >
            返回工作台
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--codex-border)] bg-white px-4 text-sm font-black text-codex-ink"
          >
            切换账号
          </Link>
        </div>
      </div>
    </div>
  );
}
