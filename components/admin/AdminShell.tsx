"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Coins,
  DatabaseZap,
  Gauge,
  FileText,
  ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import type { AdminRole } from "@/lib/admin/permissions";

type AdminShellProps = {
  admin: {
    email: string | null;
    role: AdminRole;
    source: "table" | "bootstrap-env";
  };
  children: React.ReactNode;
};

const adminNav = [
  { href: "/admin", label: "总览", icon: LayoutDashboard },
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/credits", label: "积分", icon: Coins },
  { href: "/admin/generations", label: "任务", icon: Activity },
  { href: "/admin/assets", label: "资产", icon: ImageIcon },
  { href: "/admin/moderation", label: "审核", icon: ShieldAlert },
  { href: "/admin/providers", label: "模型供应商", icon: DatabaseZap },
  { href: "/admin/workers", label: "Worker", icon: Gauge },
  { href: "/admin/members", label: "成员", icon: UserCog },
  { href: "/admin/settings", label: "配置", icon: Settings },
  { href: "/admin/audit", label: "审计", icon: ShieldCheck },
];

export function AdminShell({ admin, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[#f7f9fc] text-slate-950">
      <div className="grid min-h-dvh lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200/80 bg-white lg:block">
          <div className="sticky top-0 flex h-dvh flex-col">
            <div className="border-b border-slate-200 px-5 py-5">
              <Link href="/admin" className="flex items-center gap-3" aria-label="后台总览">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <LockKeyhole className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black leading-5">产品管理后台</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">VastWearGen Console</span>
                </span>
              </Link>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4" aria-label="后台导航">
              {adminNav.map((item) => {
                const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-bold transition ${
                      active
                        ? "bg-slate-950 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-slate-200 p-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  {admin.role}
                </div>
                <p className="mt-2 truncate text-xs font-medium text-slate-500">{admin.email || "no email"}</p>
                {admin.source === "bootstrap-env" && (
                  <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                    来自环境变量引导权限
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl">
            <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-600">
                <BarChart3 className="h-4 w-4 text-slate-400 lg:hidden" />
                <span className="truncate">产品管理后台</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                <span className="truncate text-slate-950">{currentTitle(pathname)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="hidden h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm sm:inline-flex"
                  title="PRD: docs/product-admin-prd.md"
                >
                  <FileText className="h-3.5 w-3.5" />
                  PRD
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-black text-slate-700">
                  {admin.role}
                </span>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden" aria-label="移动后台导航">
              {adminNav.map((item) => {
                const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-black ${
                      active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function currentTitle(pathname: string) {
  if (pathname.startsWith("/admin/users")) return "用户";
  if (pathname.startsWith("/admin/credits")) return "积分";
  if (pathname.startsWith("/admin/generations")) return "任务";
  if (pathname.startsWith("/admin/assets")) return "资产";
  if (pathname.startsWith("/admin/moderation")) return "审核";
  if (pathname.startsWith("/admin/providers")) return "模型供应商";
  if (pathname.startsWith("/admin/workers")) return "Worker";
  if (pathname.startsWith("/admin/members")) return "成员";
  if (pathname.startsWith("/admin/settings")) return "配置";
  if (pathname.startsWith("/admin/audit")) return "审计";
  if (pathname.startsWith("/admin/forbidden")) return "无权限";
  return "总览";
}
