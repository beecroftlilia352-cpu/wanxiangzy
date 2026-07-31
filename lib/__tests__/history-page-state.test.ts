import { describe, expect, it } from "vitest";
import {
  buildHistoryDetailUrl,
  buildHistoryFilterUrl,
  getHistoryFailureRecoveryCopy,
  getHistoryFiltersFromSearch,
  getHistoryFilterStateCopy,
  normalizeHistoryStatusFilter,
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
    expect(parseHistoryModuleFilter("materialEnhancement")).toBe("materialEnhancement");
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

  it("opens and closes details without overwriting filters or apply context", () => {
    expect(buildHistoryDetailUrl("/history?status=failed&module=tryon&apply=job_0#preview", "job_1")).toBe(
      "/history?status=failed&module=tryon&apply=job_0&detail=job_1#preview"
    );
    expect(buildHistoryDetailUrl("/history?status=failed&module=tryon&detail=job_1&apply=job_0", null)).toBe(
      "/history?status=failed&module=tryon&apply=job_0"
    );
    expect(buildHistoryFilterUrl("/history?status=failed&module=tryon&detail=job_1&apply=job_0", "pose", "completed")).toBe(
      "/history?status=completed&module=pose&detail=job_1&apply=job_0"
    );
  });

  it("normalizes legacy provider statuses into history filter buckets", () => {
    expect(normalizeHistoryStatusFilter("error")).toBe("failed");
    expect(normalizeHistoryStatusFilter("cancelled")).toBe("failed");
    expect(normalizeHistoryStatusFilter("processing_tryon")).toBe("processing");
    expect(normalizeHistoryStatusFilter("succeeded")).toBe("completed");
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
      title: "生成失败",
      reasonLabel: "失败原因",
      reason: "图片无法识别",
      recoveryLabel: "下一步",
      recoveryHint: "点击“套用参数重试”会带回原参数，调整输入素材或生成参数后重新生成。",
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
    expect(getHistoryFailureRecoveryCopy({ status: "succeeded", hasApplyParams: true })).toBeNull();
  });

  it("also treats legacy provider error statuses as recoverable failures", () => {
    expect(getHistoryFailureRecoveryCopy({ status: "error", hasApplyParams: true })?.applyLabel).toBe("套用参数重试");
    expect(getHistoryFailureRecoveryCopy({ status: "cancelled", hasApplyParams: false })?.applyLabel).toBe("重新创作");
  });
});
