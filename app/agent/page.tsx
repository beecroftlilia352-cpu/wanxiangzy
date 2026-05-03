"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, RefreshCw } from "lucide-react";
import { FeatureTabs } from "@/components/FeatureTabs";
import { GarmentUploadZone } from "@/components/agent/GarmentUploadZone";
import { RecommendationCards } from "@/components/agent/RecommendationCards";
import { ProductionBar } from "@/components/agent/ProductionBar";
import { ProductionTimeline } from "@/components/agent/ProductionTimeline";
import { ResultMatrix } from "@/components/agent/ResultMatrix";
import { useAgentStore } from "@/lib/store/agent-store";
import { createClient } from "@/lib/supabase/client";
import type { RecommendedPlan } from "@/lib/agent/types";

export default function AgentPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const view = useAgentStore((s) => s.view);
  const garments = useAgentStore((s) => s.garments);
  const recommendations = useAgentStore((s) => s.recommendations);
  const selectedPlan = useAgentStore((s) => s.selectedPlan);
  const tasks = useAgentStore((s) => s.tasks);
  const completedCount = useAgentStore((s) => s.completedCount);
  const totalImages = useAgentStore((s) => s.totalImages);
  const overallProgress = useAgentStore((s) => s.overallProgress);
  const totalCredits = useAgentStore((s) => s.totalCredits);
  const addGarments = useAgentStore((s) => s.addGarments);
  const removeGarment = useAgentStore((s) => s.removeGarment);
  const selectPlan = useAgentStore((s) => s.selectPlan);
  const startProduction = useAgentStore((s) => s.startProduction);
  const retryTask = useAgentStore((s) => s.retryTask);
  const reset = useAgentStore((s) => s.reset);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        setIsAuthenticated(true);
      }
    });
  }, [router]);

  const handleStart = async () => {
    if (!selectedPlan) {
      toast.error("请先选择方案");
      return;
    }
    await startProduction();
  };

  if (!isAuthenticated) return null;

  const isProducing = view === "producing";
  const hasResults = view === "producing" && completedCount > 0;

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="agent" />

      {/* ========== LEFT PANEL: 制作面板 ========== */}
      <div className="studio-parameters w-full lg:w-[472px] border-b lg:border-b-0 lg:border-r flex flex-col overflow-visible lg:overflow-hidden">
        <div className="studio-parameters-scroll flex-1 overflow-visible lg:overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-6">
          {/* 标题 */}
          <div className="studio-module-heading">
            <div className="inline-flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 shadow-sm">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="studio-module-heading-title">AI 视觉工作站</h1>
                <p className="text-xs text-slate-400">上传服装 → AI 分析 → 一键生产</p>
              </div>
            </div>
          </div>

          {/* 服装上传区 */}
          <GarmentUploadZone
            garments={garments}
            onAdd={addGarments}
            onRemove={removeGarment}
          />

          {/* AI 推荐方案 */}
          {view === "plans" && recommendations.length > 0 && (
            <RecommendationCards
              plans={recommendations}
              onSelect={selectPlan}
              garmentCount={garments.length}
            />
          )}

          {/* 重置按钮 */}
          {(view === "plans" || view === "producing") && (
            <button
              onClick={reset}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:text-red-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              清空重来
            </button>
          )}
        </div>

        {/* 生产控制栏 */}
        <ProductionBar
          garmentCount={garments.length}
          totalCredits={totalCredits}
          isReady={view === "plans" && garments.length > 0}
          isProducing={isProducing}
          onStart={handleStart}
        />
      </div>

      {/* ========== RIGHT PANEL: 生产画布 ========== */}
      <div className="studio-canvas min-h-[300px] flex-1 relative overflow-hidden lg:min-h-0">
        {/* 空态 */}
        {view === "empty" && <EmptyState />}

        {/* 分析中 */}
        {view === "analyzing" && <AnalyzingState count={garments.length} />}

        {/* 方案选择（左侧已有方案卡片，右侧显示引导） */}
        {view === "plans" && <PlansReadyState count={garments.length} />}

        {/* 生产中 */}
        {view === "producing" && (
          <ProductionTimeline
            tasks={tasks}
            completedCount={completedCount}
            totalCount={tasks.length}
            overallProgress={overallProgress}
            onRetry={retryTask}
            onOpenImage={setLightboxSrc}
          />
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="预览"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

/* ---- 右侧画布的三种状态 ---- */

function EmptyState() {
  return (
    <div className="studio-empty-stage absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-pink-100">
          <Sparkles className="h-10 w-10 text-violet-400" />
        </div>
        <h2 className="text-lg font-black text-slate-800">AI 视觉工作站</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          在左侧上传服装图片，AI 会自动分析并推荐最佳视觉方案，一键批量生成电商图。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-slate-100 px-3 py-1">👕 服装上身</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">📱 种草图</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">📦 3D 展示</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">🎯 全套方案</span>
        </div>
      </div>
    </div>
  );
}

function AnalyzingState({ count }: { count: number }) {
  return (
    <div className="studio-loading-stage flex h-full items-center justify-center p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-violet-100 border-t-violet-500" />
        <p className="text-sm font-bold text-slate-700">AI 正在分析 {count} 张服装图...</p>
        <p className="mt-1 text-xs text-slate-400">识别品类、风格、颜色和推荐方案</p>
      </div>
    </div>
  );
}

function PlansReadyState({ count }: { count: number }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
          <span className="text-3xl">✨</span>
        </div>
        <p className="text-sm font-bold text-slate-700">AI 分析完成</p>
        <p className="mt-1 text-xs text-slate-400">
          已识别 {count} 张服装，请在左侧选择方案并开始生产
        </p>
      </div>
    </div>
  );
}
