import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import type { TaskQueueItem } from "@/lib/task-queue";
import zhMessages from "@/messages/zh.json";

const runningTask: TaskQueueItem = {
  id: "running-general-image",
  module: "generalImage",
  scope: "image-to-image",
  title: "图生图",
  status: "processing",
  statusGroup: "running",
  time: "刚刚",
  createdAt: "2026-08-20T00:00:00.000Z",
  error: "",
  progress: 25,
  expectedCount: 4,
  resultCount: 0,
  inputThumbnails: ["ref-1", "ref-2"],
  resultThumbnails: [],
  thumbnails: ["ref-1", "ref-2"],
  applyUrl: "/general-image/image-to-image?apply=running-general-image",
};

const session: TaskSelectionSession = {
  signal: new AbortController().signal,
  reason: "manual",
  isCurrent: () => true,
  finish: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/studio/StudioTaskRail", () => ({
  StudioTaskRail: ({
    onSelectTask,
  }: {
    onSelectTask: (item: TaskQueueItem, selection: TaskSelectionSession) => Promise<unknown>;
  }) => (
    <button type="button" onClick={() => void onSelectTask(runningTask, session)}>
      select running task
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/general-image/image-to-image");
});

describe("ModuleTaskRail running task selection", () => {
  it("does not replay a fully restored running task through the completed handler", async () => {
    const onRunningTask = vi.fn().mockResolvedValue(true);
    const onCompletedTask = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <ModuleTaskRail
          module="generalImage"
          taskScope="image-to-image"
          moduleLabel="图生图"
          onRunningTask={onRunningTask}
          onCompletedTask={onCompletedTask}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(document.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(onRunningTask).toHaveBeenCalledTimes(1));
    expect(onCompletedTask).not.toHaveBeenCalled();
  });

  it("keeps the legacy detail hydration flow for snapshot-only running handlers", async () => {
    const onRunningTask = vi.fn().mockResolvedValue(undefined);
    const onCompletedTask = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <ModuleTaskRail
          module="generalImage"
          taskScope="image-to-image"
          moduleLabel="图生图"
          onRunningTask={onRunningTask}
          onCompletedTask={onCompletedTask}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(document.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(onRunningTask).toHaveBeenCalledTimes(2));
    expect(onCompletedTask).toHaveBeenCalledTimes(1);
  });
});
