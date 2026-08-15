"use client";

import { Activity, Brush, Check, ChevronRight, Edit3, Loader2, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { VisualAnalysisStatusCard } from "@/components/studio/VisualAnalysisStatus";
import {
  getProductSetModuleKey,
  getProductSetModuleQualityLabel,
  type ProductSetImageType,
  type ProductSetModuleResult,
  type ProductSetProductProfile,
  type ProductSetResolvedTemplate,
  type ProductSetStylePack,
} from "@/lib/product-set";
import {
  formatMissingInfo,
  getProductAnalysisStatus,
  splitBriefText,
  type ProductAnalysisSource,
  type ProductInfoFields,
} from "@/features/product-set/create/product-info";
import type { ProductSetAnalysisDetail } from "@/features/product-set/create/types";

const actionClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

export function ProductBriefSummary({ fields, onEdit }: { fields: ProductInfoFields; onEdit: () => void }) {
  const chips = Array.from(new Set([...splitBriefText(fields.audience), ...splitBriefText(fields.sellingPoints)])).slice(0, 5);

  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/5" aria-label="商品信息摘要">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-slate-400">商品信息</p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-stone-100">{fields.name || "待补充商品名"}</h4>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{fields.description || "已填写商品信息，点击编辑可继续补充卖点、材质和适用人群。"}</p>
        </div>
        <button type="button" onClick={onEdit} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-black text-slate-600 shadow-sm transition-colors hover:bg-[rgba(91,124,255,0.12)] hover:text-[var(--codex-accent)] dark:bg-white/10 dark:text-stone-300 dark:hover:bg-[rgba(91,140,255,0.18)] ${actionClass}`}>
          <Edit3 aria-hidden="true" className="h-3.5 w-3.5" /> 编辑
        </button>
      </div>
      {chips.length ? <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((chip) => <span key={chip} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-stone-300">{chip}</span>)}</div> : null}
    </section>
  );
}

export function AnalysisSummaryCard({ profile, analysis, stylePack, imageType, outputCount, expanded, onToggleExpanded, onEditProfile, onAdjust }: { profile: ProductSetProductProfile; analysis: ProductSetAnalysisDetail | null; stylePack: ProductSetStylePack; imageType: ProductSetImageType; outputCount: number; expanded: boolean; onToggleExpanded: () => void; onEditProfile: () => void; onAdjust: () => void }) {
  const t = useTranslations("ProductSet");
  const qualityScore = analysis?.image_quality?.quality_score;
  const qualityLabel = typeof qualityScore === "number" && qualityScore > 0 ? `${qualityScore.toFixed(1)} / 10` : "已准备";
  const strategyName = analysis?.visual_director?.strategy_name || analysis?.generation_fit?.recommended_style || stylePack.name;
  const unit = imageType === "main" ? "张主图" : "屏详情页";
  const keywords = Array.from(new Set([profile.kind, profile.apparelType, ...profile.visualKeywords, ...(analysis?.product?.style_tags || [])].filter(Boolean))).slice(0, 5);
  const missing = (analysis?.missing_info || []).filter((item) => item !== "no_missing").slice(0, 3);

  return (
    <section className="mt-3 rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] px-3 py-3" aria-label="商品分析方案">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-[var(--codex-accent)]"><Activity aria-hidden="true" className="h-3.5 w-3.5" /> 方案已生成</p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-stone-100">{profile.displayName}</h4>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{strategyName} · 计划生成 {outputCount} {unit} · 图片质量 {qualityLabel}</p>
        </div>
        <button type="button" aria-expanded={expanded} onClick={onToggleExpanded} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-black text-[var(--codex-accent)] shadow-sm transition-colors hover:bg-[rgba(91,124,255,0.12)] ${actionClass}`}>
          {expanded ? "收起细节" : "查看细节"}<ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onEditProfile} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-[11px] font-black text-slate-600 shadow-sm transition-colors hover:bg-[rgba(91,124,255,0.12)] hover:text-[var(--codex-accent)] ${actionClass}`}><Edit3 aria-hidden="true" className="h-3.5 w-3.5" /> 修改信息</button>
        <button type="button" onClick={onAdjust} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-[11px] font-black text-slate-600 shadow-sm transition-colors hover:bg-[rgba(91,124,255,0.12)] hover:text-[var(--codex-accent)] ${actionClass}`}><Palette aria-hidden="true" className="h-3.5 w-3.5" /> 调整风格</button>
      </div>
      {keywords.length ? <div className="mt-2 flex flex-wrap gap-1.5">{keywords.map((item) => <span key={item} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">{item}</span>)}</div> : null}
      {missing.length ? <p className="mt-2 text-[11px] font-bold leading-4 text-amber-600">建议补充：{missing.map((item) => formatMissingInfo(item, t)).join("、")}</p> : null}
    </section>
  );
}

export function ProductProfileCard({ profile, analysisSource, onEdit }: { profile: ProductSetProductProfile; analysisSource: ProductAnalysisSource; onEdit: () => void }) {
  const sourceLabel = analysisSource === "ai" ? "图片信息" : analysisSource === "fallback" ? "基础信息" : analysisSource === "running" ? "读取中" : analysisSource === "manual" ? "手动信息" : "待确认";
  return (
    <section className="mt-3 rounded-2xl border border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] px-3 py-3" aria-label="商品档案">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-[var(--codex-accent)]"><Brush aria-hidden="true" className="h-3.5 w-3.5" /> {sourceLabel}</p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-stone-100">{profile.displayName}</h4>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{profile.modelBrief}</p>
        </div>
        <button type="button" onClick={onEdit} className={`inline-flex h-7 shrink-0 items-center rounded-full bg-slate-100 px-2 text-[10px] font-black text-slate-600 transition-colors hover:bg-slate-200 ${actionClass}`}>{profile.needsModel ? "建议模特" : "无需模特"} · 修改</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{Array.from(new Set([profile.kind, profile.apparelType, ...profile.visualKeywords.slice(0, 3)].filter(Boolean))).map((item) => <span key={item} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">{item}</span>)}</div>
    </section>
  );
}

export function ProductVisualStrategyCard({ profile, analysis, stylePack, imageType, onAdjust }: { profile: ProductSetProductProfile; analysis: ProductSetAnalysisDetail | null; stylePack: ProductSetStylePack; imageType: ProductSetImageType; onAdjust: () => void }) {
  const t = useTranslations("ProductSet");
  const qualityScore = analysis?.image_quality?.quality_score;
  const qualityText = typeof qualityScore === "number" && qualityScore > 0 ? `${qualityScore.toFixed(1)} / 10` : "待评估";
  const strategyName = analysis?.visual_director?.strategy_name || "视觉策略";
  const globalStrategy = analysis?.visual_director?.global_strategy;
  const globalSummary = globalStrategy ? [globalStrategy.primary_color, globalStrategy.accent_color, globalStrategy.color_temperature, globalStrategy.typography].filter(Boolean).join(" · ") : "";
  const strategyReason = analysis?.visual_director?.style_strategy || globalSummary || analysis?.generation_fit?.recommended_style_reason || stylePack.description;
  const directorPlan = imageType === "main" ? analysis?.visual_director?.main_plan : analysis?.visual_director?.details_plan;
  const directorScripts = imageType === "main" ? analysis?.visual_director?.main_scripts : analysis?.visual_director?.details_scripts;
  const directions = [...(directorScripts?.map((item) => item.title || item.module_key || "") || []), ...(directorPlan?.map((item) => item.purpose || item.module_key || "") || []), ...(analysis?.visual_director?.layout_principles || []), ...(analysis?.generation_fit?.recommended_output_set || []), ...(analysis?.product?.style_tags || []), ...(analysis?.product?.visible_details || [])].filter(Boolean).slice(0, 5);
  const missing = (analysis?.missing_info || []).filter((item) => item !== "no_missing").slice(0, 4);

  return (
    <section className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-3" aria-label="视觉策略">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black text-indigo-700"><Palette aria-hidden="true" className="h-3.5 w-3.5" /> 视觉策略</p>
          <h4 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-stone-100">{strategyName} · {stylePack.name}</h4>
          <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-500">{strategyReason}</p>
        </div>
        <button type="button" onClick={onAdjust} className={`inline-flex h-7 shrink-0 items-center rounded-full bg-white px-2 text-[10px] font-black text-indigo-600 shadow-sm transition-colors hover:bg-indigo-100 ${actionClass}`}>调整风格</button>
      </div>
      <div className="mt-3 grid grid-cols-2 items-stretch gap-2">
        <div className="min-h-[58px] rounded-xl bg-white/75 px-2 py-2"><p className="text-[10px] font-black text-slate-400">图片质量</p><p className="mt-1 text-xs font-black text-slate-800">{qualityText}</p></div>
        <div className="min-h-[58px] rounded-xl bg-white/75 px-2 py-2"><p className="text-[10px] font-black text-slate-400">当前模式</p><p className="mt-1 text-xs font-black text-slate-800">{imageType === "main" ? "商品主图" : "详情页"}</p></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{(directions.length ? directions : [profile.displayName, profile.modelStrategy, "智能匹配"]).map((item) => <span key={item} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">{item}</span>)}</div>
      {missing.length ? <p className="mt-2 text-[11px] font-bold leading-4 text-amber-600">建议补充：{missing.map((item) => formatMissingInfo(item, t)).join("、")}</p> : null}
    </section>
  );
}

export function ProductAnalysisNotice({ status }: { status: ReturnType<typeof getProductAnalysisStatus> }) {
  if (status.tone === "quiet") return null;
  const tone = status.tone === "running" ? "loading" : "warning";
  const title = status.tone === "running" ? "正在读取商品图" : status.tone === "warning" ? "商品信息需确认" : "商品读取未完成";
  return <VisualAnalysisStatusCard status={{ tone, text: title, description: status.message || status.description }} className="mb-3" />;
}

export function QualityBadge({ score }: { score?: number }) {
  const quality = getProductSetModuleQualityLabel(score);
  const className = quality.tone === "good" ? "bg-emerald-50 text-emerald-600" : quality.tone === "ok" ? "bg-sky-50 text-sky-600" : quality.tone === "warn" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400";
  return <span className={`inline-flex h-6 items-center rounded-full px-2 text-[10px] font-black ${className}`}>{quality.label}{typeof score === "number" ? ` ${Math.round(score * 100)}` : ""}</span>;
}

export function ModuleProgressList({ templates, moduleResults, resultUrls, isGenerating, compact = false }: { templates: ProductSetResolvedTemplate[]; moduleResults: ProductSetModuleResult[]; resultUrls: string[]; isGenerating: boolean; compact?: boolean }) {
  if (!templates.length) return null;
  return (
    <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`} aria-label="模块生成进度">
      {templates.map((template, index) => {
        const moduleResult = moduleResults.find((item) => item.moduleKey === getProductSetModuleKey(template, index)) || moduleResults.find((item) => Number(item.index) === index + 1) || moduleResults[index];
        const moduleUrl = typeof moduleResult?.resultUrl === "string" && moduleResult.resultUrl.length > 0 ? moduleResult.resultUrl : "";
        const done = moduleResult?.status === "completed" || Boolean(moduleUrl || resultUrls[index]);
        const failed = moduleResult?.status === "failed";
        const current = moduleResult?.status === "running" || (isGenerating && !done && resultUrls.filter(Boolean).length === index);
        const statusText = failed ? "失败" : done ? "已完成" : current ? `${moduleResult?.progress || "生成"}%` : "排队";
        return (
          <div key={`${template.source}-${template.id}-${index}`} className={`flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${failed ? "border-red-100 bg-red-50 text-red-600" : done ? "border-emerald-100 bg-emerald-50 text-emerald-700" : current ? "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "border-slate-100 bg-slate-50 text-slate-500"}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black shadow-sm">{done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : current ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-black">{template.name}</span>
            {done && moduleResult?.qualityScore !== undefined ? <QualityBadge score={moduleResult.qualityScore} /> : null}
            <span className="shrink-0 text-[10px] font-bold">{statusText}</span>
          </div>
        );
      })}
    </div>
  );
}
