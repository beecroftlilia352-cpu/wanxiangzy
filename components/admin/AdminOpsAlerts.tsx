import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import type { AdminOverview } from "@/lib/admin/data";

/**
 * 运营提示：基于首页数据的智能提醒，只提示真正需要处理的异常。
 * 全部正常时显示绿色状态条，有异常时逐条给出直达链接。
 */
export function AdminOpsAlerts({ overview }: { overview: AdminOverview }) {
  const alerts: Array<{ key: string; tone: "danger" | "warning" | "info"; icon: React.ReactNode; text: string; href: string }> = [];
  const failureRate = overview.generationHealth.failureRate;

  if (failureRate > 0.15) {
    alerts.push({
      key: "high-failure",
      tone: "danger",
      icon: <AlertTriangle aria-hidden="true" className="h-4 w-4" />,
      text: `生成失败率 ${Math.round(failureRate * 100)}%，明显偏高，建议排查上游模型状态`,
      href: "/admin/generations?status=failed",
    });
  }
  if (overview.taskHealth.queued > 10) {
    alerts.push({
      key: "queue",
      tone: "warning",
      icon: <Clock3 aria-hidden="true" className="h-4 w-4" />,
      text: `${overview.taskHealth.queued} 个任务排队中，建议检查 Worker 在线状态与队列健康`,
      href: "/admin/workers",
    });
  }
  if (overview.pendingApprovals > 0) {
    alerts.push({
      key: "approvals",
      tone: "warning",
      icon: <ShieldAlert aria-hidden="true" className="h-4 w-4" />,
      text: `${overview.pendingApprovals} 个审批单待处理，请及时处理退款和补偿申请`,
      href: "/admin/requests?status=pending",
    });
  }

  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] px-4 py-2.5">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--admin-success)]" />
        <p className="text-xs font-bold text-[var(--admin-success)]">当前运营状态正常：失败率在阈值内、无明显排队积压、无待处理审批。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <Link
          key={alert.key}
          href={alert.href}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition hover:opacity-90 ${
            alert.tone === "danger"
              ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]"
              : "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
          }`}
        >
          {alert.icon}
          <span className="min-w-0 flex-1">{alert.text}</span>
          <span className="shrink-0 underline decoration-dotted underline-offset-2">去处理</span>
        </Link>
      ))}
    </div>
  );
}
