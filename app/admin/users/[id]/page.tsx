import Link from "next/link";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  ThumbnailStrip,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { AdminTaskActions } from "@/components/admin/AdminTaskActions";
import { AdminUserManagementForm } from "@/components/admin/AdminUserManagementForm";
import {
  getAdminUserDetail,
  type AdminAssetListItem,
  type AdminCreditLogItem,
  type AdminTaskListItem,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getAdminUserDetail(id);
  const profile = detail.profile;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="User Detail"
        title={profile?.email || "用户详情"}
        description="集中查看用户资料、积分流水、任务历史和资产作品，并提供资料、积分和生成权限管理。"
        actions={
          <Link href="/admin/users" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50">
            返回用户列表
          </Link>
        }
      />

      {!profile && <AdminNotice tone="danger">未找到该用户资料。</AdminNotice>}
      {detail.warnings.length > 0 && <AdminNotice>详情数据源提示：{detail.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard label="积分余额" value={formatNumber(profile?.credits || 0)} />
        <AdminMetricCard label="累计消耗" value={formatNumber(profile?.totalCreditsUsed || 0)} />
        <AdminMetricCard
          label="生成权限"
          value={profile?.generateEnabled ? "可生成" : "已暂停"}
          tone={profile?.generateEnabled ? "good" : "danger"}
          hint={profile?.controlReason || undefined}
        />
        <AdminMetricCard label="任务样本" value={formatNumber(detail.tasks.length)} />
      </div>

      <AdminSection title="基础资料">
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="用户 ID" value={id} mono />
          <DetailItem label="邮箱" value={profile?.email || "-"} />
          <DetailItem label="显示名" value={profile?.displayName || "-"} />
          <DetailItem label="账号状态" value={profile ? accountStatusLabel(profile.accountStatus) : "-"} />
          <DetailItem label="服务等级" value={profile ? supportLevelLabel(profile.supportLevel) : "-"} />
          <DetailItem label="限制到期" value={formatDateTime(profile?.controlExpiresAt)} />
          <DetailItem label="注册时间" value={formatDateTime(profile?.createdAt)} />
        </dl>
      </AdminSection>

      {profile && (
        <AdminSection
          title="用户操作"
          description="所有写操作都会进入后台审计日志；暂停生成会在扣积分和创建任务前生效。"
        >
          <AdminUserManagementForm profile={profile} />
        </AdminSection>
      )}

      <AdminSection title="最近积分流水">
        <AdminTable<AdminCreditLogItem>
          rows={detail.creditLogs}
          rowKey={(row) => row.id}
          empty="暂无积分流水"
          columns={[
            { key: "amount", label: "变动", render: (row) => <span className={`font-mono text-sm font-black ${row.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>{row.amount > 0 ? "+" : ""}{formatNumber(row.amount)}</span> },
            { key: "balance", label: "余额", render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{formatNumber(row.balance)}</span> },
            { key: "reason", label: "原因", render: (row) => <span className="text-sm font-semibold text-slate-700">{row.reason}</span> },
            { key: "generation", label: "生成", render: (row) => row.generationId ? <Link href={`/admin/generations/${row.generationId}`} className="font-mono text-xs font-bold text-slate-700 hover:underline">{row.generationId}</Link> : <span className="text-xs text-slate-400">-</span> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="最近任务">
        <AdminTable<AdminTaskListItem>
          rows={detail.tasks}
          rowKey={(row) => `${row.sourceType}:${row.sourceId}`}
          empty="暂无任务"
          columns={[
            {
              key: "task",
              label: "任务",
              render: (row) => (
                <div className="min-w-[240px]">
                  <AdminStatusBadge status={row.status} group={row.statusGroup} />
                  <Link href={`/admin/generations/${row.sourceId}`} className="mt-1 block truncate text-sm font-black text-slate-950 hover:underline">
                    {row.title}
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.sourceId}</p>
                </div>
              ),
            },
            { key: "thumbs", label: "图像", render: (row) => <ThumbnailStrip urls={row.resultThumbnails.length ? row.resultThumbnails : row.inputThumbnails} /> },
            { key: "module", label: "模块", render: (row) => <span className="text-sm font-bold text-slate-700">{row.moduleLabel}</span> },
            { key: "stale", label: "卡住", render: (row) => <span className={`whitespace-nowrap text-xs font-black ${row.isStale ? "text-orange-700" : "text-slate-400"}`}>{row.isStale ? `${row.staleMinutes} 分钟` : "-"}</span> },
            { key: "actions", label: "操作", render: (row) => <AdminTaskActions id={row.sourceId} sourceType={row.sourceType} statusGroup={row.statusGroup} isStale={row.isStale} compact /> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="最近资产">
        <AdminTable<AdminAssetListItem>
          rows={detail.assets}
          rowKey={(row) => `${row.sourceType}:${row.id}`}
          empty="暂无资产"
          columns={[
            { key: "preview", label: "预览", render: (row) => <ThumbnailStrip urls={row.urls.length ? row.urls : row.inputUrls} /> },
            { key: "title", label: "标题", render: (row) => <span className="text-sm font-black text-slate-950">{row.title}</span> },
            { key: "module", label: "模块", render: (row) => <span className="text-sm font-bold text-slate-700">{row.moduleLabel}</span> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.updatedAt || row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className={`mt-1 break-all text-sm font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function accountStatusLabel(value: string) {
  if (value === "restricted") return "观察";
  if (value === "suspended") return "暂停";
  return "正常";
}

function supportLevelLabel(value: string) {
  if (value === "priority") return "优先";
  if (value === "watch") return "重点观察";
  return "标准";
}
