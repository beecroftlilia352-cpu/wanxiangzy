import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResourcePickerDialog } from "@/features/resource-library/ResourcePickerDialog";

const messages = {
  Shared: { close: "关闭" },
  ResourceLibrary: {
    actions: {
      cancel: "取消", close: "关闭", confirm: "确认", loadMore: "加载更多", localUpload: "本地上传", retry: "重试",
    },
    categories: { title: "我的资源", localUploads: "本地上传" },
    filters: { mediaLabel: "媒体类型", allMedia: "全部", image: "图片", video: "视频" },
    picker: {
      title: "选择资源",
      selectionHint: "已选 {selected}/{max}",
      selectedCount: "已选 {selected}/{max}",
      gridLabel: "资源列表",
      limitReachedTitle: "已达到上限",
      limitReachedDescription: "请先移除已有资源",
      limitReachedInline: "最多选择 {max} 项",
    },
    card: { select: "选择 {title}", removeSelection: "取消选择 {title}" },
    empty: {
      uploadTitle: "暂无上传", uploadDescription: "上传资源后会显示在这里",
      moduleTitle: "暂无收藏", moduleDescription: "收藏生成结果后会显示在这里",
    },
    states: {
      loading: "加载中", uploading: "上传中", uploadFailed: "上传失败",
      loadFailedTitle: "加载失败", loadFailedDescription: "请稍后重试",
    },
    modules: { pose: "姿势裂变" },
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResourcePickerDialog", () => {
  it("treats Escape as cancel and never confirms a draft", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes("/facets")
        ? { modules: [], media: [], views: [] }
        : { items: [], hasMore: false, nextCursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <ResourcePickerDialog
          open
          request={{ selectionMode: "multiple", maxCount: 3, existingCount: 1, mediaTypes: ["image"] }}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeTruthy());
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
