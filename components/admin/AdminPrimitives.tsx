import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, ImageIcon } from "lucide-react";
import type { TaskStatusGroup } from "@/lib/task-queue";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AdminSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function AdminMetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  suffix,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warning" | "danger";
  suffix?: string;
}) {
  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${metricToneClass(tone)}`}>
      <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-black tabular-nums text-slate-950">{value}</span>
        {suffix && <span className="text-xs font-bold text-slate-500">{suffix}</span>}
      </div>
      {hint && <p className="mt-2 text-xs font-semibold text-slate-500">{hint}</p>}
    </div>
  );
}

export function AdminNotice({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "danger" | "info" }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-6 ${noticeToneClass(tone)}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function AdminStatusBadge({ status, group }: { status: string; group?: TaskStatusGroup }) {
  const normalized = (group || status).toLowerCase();
  const className =
    normalized === "completed" || normalized === "success" || normalized === "published" || normalized === "pass"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "failed" || normalized === "danger" || normalized === "hide"
        ? "border-red-200 bg-red-50 text-red-700"
      : normalized === "running" || normalized.startsWith("processing")
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : normalized === "queued" || normalized === "draft" || normalized === "escalate"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-black leading-none ${className}`}>
      {formatStatusLabel(status, group)}
    </span>
  );
}

export function AdminTable<T>({
  rows,
  columns,
  empty,
  rowKey,
}: {
  rows: T[];
  columns: Array<{
    key: string;
    label: string;
    className?: string;
    render: (row: T) => ReactNode;
  }>;
  empty?: ReactNode;
  rowKey: (row: T, index: number) => string;
}) {
  if (!rows.length) {
    return (
      <div className="flex min-h-44 items-center justify-center px-4 py-8 text-center">
        <div>
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <ImageIcon className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-700">{empty || "暂无数据"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-slate-400 ${column.className || ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="hover:bg-slate-50/80">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 align-middle ${column.className || ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ThumbnailStrip({ urls }: { urls: string[] }) {
  const visible = urls.filter(Boolean).slice(0, 3);
  if (!visible.length) return <span className="text-xs font-semibold text-slate-400">无图片</span>;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((url, index) => (
        <span key={`${url}-${index}`} className="relative h-9 w-9 overflow-hidden rounded-md border border-white bg-slate-100 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        </span>
      ))}
      {urls.length > visible.length && (
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] font-black text-slate-500">
          +{urls.length - visible.length}
        </span>
      )}
    </div>
  );
}

export function AdminExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-black text-slate-600 hover:text-slate-950">
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function metricToneClass(tone: "neutral" | "good" | "warning" | "danger") {
  if (tone === "good") return "border-emerald-200";
  if (tone === "warning") return "border-amber-200";
  if (tone === "danger") return "border-red-200";
  return "border-slate-200";
}

function noticeToneClass(tone: "warning" | "danger" | "info") {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "info") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function formatStatusLabel(status: string, group?: TaskStatusGroup) {
  const label = group || status;
  if (label === "completed") return "已完成";
  if (label === "failed") return "失败";
  if (label === "running") return "运行中";
  if (label === "queued") return "排队中";
  if (label === "published") return "已发布";
  if (label === "draft") return "草稿";
  if (label === "archived") return "已归档";
  if (label === "hide") return "下架";
  if (label === "pass") return "通过";
  if (label === "escalate") return "复核";
  return status || "-";
}
