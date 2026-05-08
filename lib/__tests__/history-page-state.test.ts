import { describe, expect, it } from "vitest";
import { getHistoryFilterStateCopy } from "@/lib/history-page-state";

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
    expect(state.emptyTitle).toBe("当前筛选下还没有作品");
    expect(state.emptyActionLabel).toBe("清除筛选");
    expect(state.emptyMessage).toContain("清除筛选查看全部作品");
    expect(state.noMatchMessage).toContain("继续加载更多历史记录");
  });
});
