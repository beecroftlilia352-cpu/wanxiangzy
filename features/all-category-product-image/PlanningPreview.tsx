"use client";

import { BadgeCheck, ChevronDown, Edit3, PackageCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DETAILS_ASPECTS,
  MAIN_ASPECTS,
  type PlanningModule,
} from "@/features/all-category-product-image/shared";
import type { AspectRatio } from "@/lib/api/lingya";
import type { ProductSetImageType } from "@/lib/product-set";
import { EditField } from "@/features/all-category-product-image/EditField";
import { SelectField } from "@/features/all-category-product-image/SelectField";

type Props = {
  productName: string;
  designSpec: string;
  editingDesignSpec: boolean;
  modules: PlanningModule[];
  imageType: ProductSetImageType;
  canGenerate: boolean;
  onEditDesignSpec: () => void;
  onDesignSpecChange: (value: string) => void;
  onModuleChange: (id: string, patch: Partial<PlanningModule>) => void;
  onGenerate: () => void;
};

/**
 * "确认规划" 步骤的整体预览：
 *   1. 设计规范卡片（可切到编辑模式）
 *   2. N 个 plan 模块（每行可展开编辑标题 / 描述 / 画幅 / 细节规则）
 *   3. 顶部"确认生成"按钮（disabled when !canGenerate）
 */
export function PlanningPreview({
  productName,
  designSpec,
  editingDesignSpec,
  modules,
  imageType,
  canGenerate,
  onEditDesignSpec,
  onDesignSpecChange,
  onModuleChange,
  onGenerate,
}: Props) {
  const t = useTranslations("AllCategoryProduct");
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-lg border border-[var(--codex-border)] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--codex-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--codex-surface-soft)] text-codex-muted">
              <BadgeCheck aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-codex-ink">{t("overallPlanPreview")}</h3>
              <p className="truncate text-xs text-codex-muted">
                {t("allFollowSameStandard", { name: productName })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEditDesignSpec}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--codex-border)] px-3 text-xs font-black text-codex-muted hover:bg-[var(--codex-surface-soft)]"
          >
            <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />
            {editingDesignSpec ? t("previewMode") : t("editMode")}
          </button>
        </div>
        <div className="p-4">
          {editingDesignSpec ? (
            <textarea
              value={designSpec}
              onChange={(event) => onDesignSpecChange(event.target.value)}
              className="min-h-[300px] w-full resize-y rounded-lg border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] p-3 font-mono text-xs leading-6 text-codex-ink outline-none focus:border-[var(--codex-border-strong)]"
            />
          ) : (
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--codex-surface-soft)] p-4 text-sm leading-7 text-codex-ink">
              {designSpec}
            </pre>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--codex-border)] bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-black text-codex-ink">{t("imagePlan")}</h3>
            <p className="mt-1 text-xs text-codex-muted">{t("imagePlanSub", { count: modules.length })}</p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-codex-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PackageCheck aria-hidden="true" className="h-4 w-4" />
            {t("confirmGenerateBtn", { count: modules.length })}
          </button>
        </div>

        <div className="space-y-3">
          {modules.map((module, index) => (
            <article key={module.id} className="rounded-lg border border-[var(--codex-border)]">
              <button
                type="button"
                onClick={() => onModuleChange(module.id, { expanded: !module.expanded })}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--codex-surface-soft)] text-sm font-black text-codex-ink">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-codex-ink">{module.title}</span>
                    <span className="block truncate text-xs text-codex-muted">{module.description}</span>
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-codex-faint transition ${module.expanded ? "rotate-180" : ""}`}
                />
              </button>
              {module.expanded && (
                <div className="grid gap-3 border-t border-[var(--codex-border)] bg-[var(--codex-surface-soft)] p-4 md:grid-cols-2">
                  <EditField
                    label={t("editTitle")}
                    value={module.title}
                    onChange={(value) => onModuleChange(module.id, { title: value })}
                  />
                  <SelectField
                    label={t("imageRatio")}
                    value={module.aspectRatio}
                    options={imageType === "main" ? MAIN_ASPECTS : DETAILS_ASPECTS}
                    onChange={(value) => onModuleChange(module.id, { aspectRatio: value as AspectRatio })}
                  />
                  <EditField
                    label={t("editDescription")}
                    value={module.description}
                    onChange={(value) => onModuleChange(module.id, { description: value })}
                    textarea
                  />
                  <EditField
                    label={t("editDetailRules")}
                    value={module.detailPrompt}
                    onChange={(value) => onModuleChange(module.id, { detailPrompt: value })}
                    textarea
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}