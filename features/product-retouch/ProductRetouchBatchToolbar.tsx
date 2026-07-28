"use client";

import { ChevronDown, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProductRetouchBatch } from "@/lib/product-retouch";

export type ProductRetouchFilter = "all" | "running" | "completed" | "failed";

type ProductRetouchBatchToolbarProps = {
  batch: ProductRetouchBatch;
  filter: ProductRetouchFilter;
  onFilterChange: (filter: ProductRetouchFilter) => void;
  onDownloadAll: () => void;
  downloading?: boolean;
};

export function ProductRetouchBatchToolbar({
  batch,
  filter,
  onFilterChange,
  onDownloadAll,
  downloading,
}: ProductRetouchBatchToolbarProps) {
  const terminalCount = batch.completedCount + batch.failedCount;
  const progress = batch.expectedCount > 0
    ? Math.round((terminalCount / batch.expectedCount) * 100)
    : 0;
  const status = getBatchStatusMeta(batch.status);
  const canDownload = batch.completedCount > 0 && !downloading;

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-border/70 bg-background/92 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-xs font-medium text-muted-foreground">
              已完成 {batch.completedCount} / {batch.expectedCount}
              {batch.failedCount > 0 ? ` · 失败 ${batch.failedCount}` : ""}
            </span>
          </div>
          <Progress
            value={progress}
            aria-label={`商品精修进度 ${progress}%`}
            className="mt-2 h-1.5"
          />
        </div>

        <TooltipProvider>
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!canDownload}>
                    {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                    下载结果
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onDownloadAll}>
                  <Download />
                  下载全部成功结果 ZIP
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!canDownload && !downloading ? (
              <TooltipContent>生成成功后可批量下载</TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
      </div>

      <Tabs
        value={filter}
        onValueChange={(value) => onFilterChange(value as ProductRetouchFilter)}
        className="mt-3"
      >
        <TabsList aria-label="筛选商品精修结果" className="h-8 max-w-full overflow-x-auto">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="running">进行中</TabsTrigger>
          <TabsTrigger value="completed">已完成</TabsTrigger>
          <TabsTrigger value="failed">失败</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function getBatchStatusMeta(status: ProductRetouchBatch["status"]): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (status === "completed") return { label: "全部完成", variant: "default" };
  if (status === "partially_completed") return { label: "部分完成", variant: "secondary" };
  if (status === "failed") return { label: "批次失败", variant: "destructive" };
  if (status === "processing") return { label: "生产中", variant: "secondary" };
  return { label: "排队中", variant: "outline" };
}
