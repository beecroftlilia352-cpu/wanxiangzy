import type { AllCategoryImagePlanItem } from "@/lib/all-category-product-image";
import type { AspectRatio } from "@/lib/api/lingya";
import type { ProductSetModuleResult } from "@/lib/product-set";

/**
 * 5 步流程：input → analyzing → planning → generating → done。
 *
 * 渲染于页面顶部的 StepBar，根据 activeStepIndex 计算 isActive/isDone。
 */
export type StepKey = "input" | "analyzing" | "planning" | "generating" | "done";

/** StepBar 渲染用的元组：与 StepKey 一一对应。 */
export const STEPS: readonly { key: StepKey }[] = [
  { key: "input" },
  { key: "analyzing" },
  { key: "planning" },
  { key: "generating" },
  { key: "done" },
] as const;

/** 当前步骤下方 / ResultGrid 顶部用的"组合编辑行"。 */
export type PlanningModule = AllCategoryImagePlanItem & {
  aspectRatio: AspectRatio;
  expanded: boolean;
};

/** 单张结果卡片的状态：success / failed / queued / running。 */
export type ResultSlotStatus = "completed" | "failed" | "queued" | "running";

/** ResultGrid 每张卡片的扁平数据：module 信息 + 实际结果 URL / 状态 / 错误。 */
export type ResultSlot = {
  module: PlanningModule;
  result: ProductSetModuleResult | undefined;
  url: string | undefined;
  status: ResultSlotStatus;
  progress: number;
  error: string | undefined;
};

/** 主图与详情图可选的画幅集合（不含 "9:16" 等长条幅，主图偏方形 / 横版）。 */
export const MAIN_ASPECTS: AspectRatio[] = ["auto", "1:1", "3:4", "4:3"];
export const DETAILS_ASPECTS: AspectRatio[] = ["auto", "3:4", "4:5", "4:3", "1:1"];

/**
 * 根据当前阶段 + 进度（0-99）取一段滚动文案。
 *
 * - generating 阶段显示 6 句不同进度提示；
 * - 其他阶段（通常是 analyzing）显示 3 句不同提示。
 *
 * progress=0 时落到 index 0；progress=99 时落到最后一句。
 */
export function getProgressMessage(
  t: (key: string) => string,
  step: StepKey,
  progress: number,
): string {
  const messages =
    step === "generating"
      ? [
          t("generateProgress1"),
          t("generateProgress2"),
          t("generateProgress3"),
          t("generateProgress4"),
          t("generateProgress5"),
          t("generateProgress6"),
        ]
      : [t("analyzeProgress1"), t("analyzeProgress2"), t("analyzeProgress3")];
  const normalizedProgress = Math.min(Math.max(progress || 0, 0), 99);
  const index = Math.min(
    messages.length - 1,
    Math.floor(normalizedProgress / (100 / messages.length)),
  );
  return messages[index];
}

/**
 * 把后端的 aspectRatio 值映射成 UI label。
 * "auto" 在没有 translation function 时退化为中文"智能"。
 */
export function getAspectRatioLabel(value: string, t?: (key: string) => string): string {
  return value === "auto" ? (t ? t("aspectAuto") : "智能") : value;
}

function getResultForModule(
  results: ProductSetModuleResult[],
  module: PlanningModule,
  index: number,
): ProductSetModuleResult | undefined {
  return results.find((item) => item.templateId === module.id || item.index === index + 1);
}

/**
 * 把规划模块列表 + 服务端结果 + 全局 resultUrls 合并成扁平结构，供 ResultGrid 渲染。
 *
 * 优先级：先按 templateId / index 匹配 moduleResults，再用 resultUrls 兜底。
 * status 在没有 result 时根据 resultUrls 是否存在决定 completed vs queued；明确 error 落到 failed。
 */
export function buildResultSlots(
  modules: PlanningModule[],
  moduleResults: ProductSetModuleResult[],
  resultUrls: string[],
): ResultSlot[] {
  return modules.map((module, index) => {
    const result = getResultForModule(moduleResults, module, index);
    return {
      module,
      result,
      url: result?.resultUrl || resultUrls[index],
      status: result?.status || (resultUrls[index] ? "completed" : "queued"),
      progress: result?.progress || 0,
      error: result?.error,
    };
  });
}