"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Segmented } from "@/components/ui/shadcn-compat";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";

const dayOptions = [
  { label: "今天", value: 1 },
  { label: "近 7 天", value: 7 },
  { label: "近 14 天", value: 14 },
  { label: "近 30 天", value: 30 },
];

/**
 * 运营总览外壳：头部（标题 + 时间窗口切换 + 刷新）立即渲染，
 * 数据区由服务端流式补充（Suspense 包裹），首屏不再等待全部查询完成。
 */
export function AdminDashboardShell({ days, children }: { days: number; children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="flex w-full flex-col gap-5">
      <AdminPageHeader
        eyebrow="运营总览"
        title="运营总览"
        description="生成任务、灵点流水与队列健康统一看板。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span id="dashboard-days-help" className="sr-only">
              改变下方所有图表和 KPI 趋势线的时间窗口
            </span>
            <Segmented
              value={days}
              options={dayOptions}
              onChange={(value) => {
                const href = value === 7 ? "/admin" : `/admin?days=${value}`;
                router.push(href);
              }}
              aria-label="选择时间窗口"
              aria-describedby="dashboard-days-help"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin?days=${days}`)}
              aria-label="刷新运营总览"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              刷新
            </Button>
          </div>
        }
      />
      {children}
    </div>
  );
}
