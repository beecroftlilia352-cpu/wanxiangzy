"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type VisualAnalysisTone = "loading" | "success" | "warning";

export type VisualAnalysisInlineStatus = {
  tone: VisualAnalysisTone;
  text: string;
  description?: string;
};

export type VisualAnalysisSummaryItem = {
  key: string;
  title: string;
  detail?: string;
};

export function VisualAnalysisStatusCard({
  status,
  summaries = [],
  maxVisible,
  isAnalyzing = false,
  action,
  className,
  children,
}: {
  status: VisualAnalysisInlineStatus | null;
  summaries?: VisualAnalysisSummaryItem[];
  maxVisible?: number;
  isAnalyzing?: boolean;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const t = useTranslations("Shared");
  if (!status) return null;

  const summaryLimit = typeof maxVisible === "number" ? Math.max(0, maxVisible) : summaries.length;
  const visibleSummaries = !isAnalyzing ? summaries.slice(0, summaryLimit) : [];
  const hiddenCount = Math.max(0, summaries.length - visibleSummaries.length);
  const Icon = status.tone === "loading" ? Loader2 : status.tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className={cn("studio-visual-analysis-card", className)} data-tone={status.tone}>
      <div className="studio-visual-analysis-header">
        <span className={cn("studio-visual-analysis-icon", status.tone === "loading" && "studio-visual-analysis-icon-loading")} aria-hidden="true">
          <Icon className={cn("h-3.5 w-3.5", status.tone === "loading" && "animate-spin studio-visual-analysis-loading-icon")} />
        </span>
        <span className="studio-visual-analysis-copy">
          <span className="studio-visual-analysis-title">
            {status.text}
            {status.tone === "loading" ? (
              <span className="studio-visual-analysis-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </span>
          {status.description ? <span className="studio-visual-analysis-desc">{status.description}</span> : null}
        </span>
        {action ? <span className="studio-visual-analysis-action">{action}</span> : null}
      </div>

      {status.tone === "loading" ? (
        <span className="studio-visual-analysis-loading-track" aria-hidden="true">
          <span />
        </span>
      ) : null}

      {visibleSummaries.length > 0 ? (
        <div className="studio-visual-analysis-tags">
          {visibleSummaries.map((item) => (
            <span key={item.key} className="studio-visual-analysis-tag" title={[item.title, item.detail].filter(Boolean).join(" · ")}>
              <ScanLine className="h-3 w-3" />
              <span>{item.title}</span>
              {item.detail ? <span className="studio-visual-analysis-tag-detail">{item.detail}</span> : null}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className="studio-visual-analysis-more">{t("moreCount", { count: hiddenCount })}</span>
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );
}
