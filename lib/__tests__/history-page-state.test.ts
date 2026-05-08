import { describe, expect, it } from "vitest";
import {
  buildHistoryFilterUrl,
  getHistoryFailureRecoveryCopy,
  getHistoryFiltersFromSearch,
  getHistoryFilterStateCopy,
  parseHistoryModuleFilter,
  parseHistoryStatusFilter,
} from "@/lib/history-page-state";

describe("getHistoryFilterStateCopy", () => {
  it("describes the unfiltered history state", () => {
    const state = getHistoryFilterStateCopy("all", "all");

    expect(state.isFiltered).toBe(false);
    expect(state.summary).toBe("当前筛选：全部模块 / 全部状态");
    expect(state.emptyTitle).toBe("还没有作品");
    expect(state.emptyActionLabel).toBe("开始创作");
    expect(state.activeDescription).toBe("正在查看全部历史作品。");
  });

  it("describes module and status URL filters with a clear next action", () => {
    const state = getHistoryFilterStateCopy("garment3d", "failed");

    expect(state.isFiltered).toBe(true);
    expect(state.summary).toBe("当前筛选：服装 3D / 失败");
    expect(state.emptyTitle).toBe("还没有失败记录");
    expect(state.emptyActionLabel).toBe("清除筛选");
    expect(state.activeDescription).toContain("失败记录");
    expect(state.emptyMessage).toContain("保留可套用的参数入口");
    expect(state.noMatchMessage).toContain("没有失败项");
  });

  it("parses supported URL filters and falls back to all for unknown values", () => {
    expect(parseHistoryModuleFilter("tryon")).toBe("tryon");
    expect(parseHistoryStatusFilter("failed")).toBe("failed");
    expect(parseHistoryModuleFilter("unknown")).toBe("all");
    expect(parseHistoryStatusFilter("archived")).toBe("all");
    expect(getHistoryFiltersFromSearch("?module=pose&status=pending")).toEqual({
      moduleFilter: "pose",
      statusFilter: "pending",
    });
  });

  it("syncs filters into the URL without dropping other query params or hash", () => {
    expect(buildHistoryFilterUrl("/history?detail=job_1&status=completed#preview", "garment3d", "failed")).toBe(
      "/history?detail=job_1&status=failed&module=garment3d#preview"
    );
    expect(buildHistoryFilterUrl("/history?module=tryon&status=failed&detail=job_1", "all", "all")).toBe(
      "/history?detail=job_1"
    );
  });
});

describe("getHistoryFailureRecoveryCopy", () => {
  it("returns recovery copy for failed records with reusable parameters", () => {
    const copy = getHistoryFailureRecoveryCopy({
      status: "failed",
      errorMessage: "图片无法识别",
      hasApplyParams: true,
    });

    expect(copy).toEqual({
      title: "生成失败，未扣除可下载结果",
      reason: "图片无法识别",
      recoveryHint: "可点击「套用」带回原参数，调整图片或提示词后重新生成。",
      applyLabel: "套用参数重试",
    });
  });

  it("uses a fallback reason and creation hint when apply params are missing", () => {
    const copy = getHistoryFailureRecoveryCopy({
      status: "failed",
      errorMessage: "   ",
      hasApplyParams: false,
    });

    expect(copy?.reason).toContain("没有返回明确原因");
    expect(copy?.recoveryHint).toContain("回到创作页");
    expect(copy?.applyLabel).toBe("重新创作");
  });

  it("does not return failure copy for non-failed statuses", () => {
    expect(getHistoryFailureRecoveryCopy({ status: "completed", hasApplyParams: true })).toBeNull();
  });

  it("also treats legacy provider error statuses as recoverable failures", () => {
    expect(getHistoryFailureRecoveryCopy({ status: "error", hasApplyParams: true })?.applyLabel).toBe("套用参数重试");
    expect(getHistoryFailureRecoveryCopy({ status: "cancelled", hasApplyParams: false })?.applyLabel).toBe("重新创作");
  });
});
