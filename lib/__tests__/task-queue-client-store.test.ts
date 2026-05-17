import { describe, expect, it } from "vitest";

import type { TaskQueueItem } from "../task-queue";
import {
  createOptimisticTaskQueueItem,
  reconcileTaskQueueRows,
  removeTaskQueueRow,
  upsertTaskQueueRow,
  useTaskQueueStore,
} from "../task-queue-client-store";
import { buildTaskQueueGenerationItem } from "../../components/studio/useTaskQueueGeneration";

function task(overrides: Partial<TaskQueueItem> & Pick<TaskQueueItem, "id">): TaskQueueItem {
  const { id, ...rest } = overrides;
  return {
    id,
    module: "tryon",
    title: "Task",
    status: "processing",
    statusGroup: "running",
    time: "0:00",
    createdAt: "2026-05-16T10:00:00.000Z",
    updatedAt: "2026-05-16T10:00:00.000Z",
    completedAt: null,
    error: "",
    progress: 30,
    expectedCount: 1,
    resultCount: 0,
    inputThumbnails: [],
    resultThumbnails: [],
    thumbnails: [],
    applyUrl: "",
    ...rest,
  };
}

describe("task queue client store helpers", () => {
  it("creates a complete optimistic task item", () => {
    const item = createOptimisticTaskQueueItem({
      id: "local-tryon-1",
      module: "tryon",
      title: "服装上身",
      expectedCount: 2,
      inputThumbnails: ["https://example.com/input.png"],
    });

    expect(item.id).toBe("local-tryon-1");
    expect(item.statusGroup).toBe("queued");
    expect(item.expectedCount).toBe(2);
    expect(item.thumbnails).toEqual(["https://example.com/input.png"]);
    expect(item.applyUrl).toBe("");
  });

  it("keeps a fresh local pending item when the server list has not caught up", () => {
    const local = task({
      id: "local-tryon-1",
      statusGroup: "queued",
      createdAt: new Date().toISOString(),
    });

    expect(reconcileTaskQueueRows([local], [], "tryon")).toEqual([local]);
  });

  it("replaces a local pending item once a server task arrives", () => {
    const local = task({ id: "local-tryon-1", statusGroup: "queued" });
    const server = task({ id: "gen-1", statusGroup: "running", applyUrl: "/create?apply=gen-1" });

    expect(upsertTaskQueueRow([local], server, "tryon")).toEqual([server]);
  });

  it("keeps uploaded input thumbnails when a server task replaces a temporary id", () => {
    const local = task({
      id: "local-tryon-1",
      statusGroup: "queued",
      progress: 45,
      expectedCount: 4,
      inputThumbnails: ["https://example.com/upload.png"],
      thumbnails: ["https://example.com/upload.png"],
    });
    const server = task({
      id: "gen-1",
      statusGroup: "running",
      progress: 20,
      expectedCount: 1,
      inputThumbnails: [],
      resultThumbnails: [],
      thumbnails: [],
    });

    expect(upsertTaskQueueRow([local], server, "tryon")).toEqual([
      {
        ...server,
        progress: 45,
        expectedCount: 4,
        inputThumbnails: ["https://example.com/upload.png"],
        thumbnails: ["https://example.com/upload.png"],
      },
    ]);
  });

  it("keeps uploaded input thumbnails during server reconciliation with a new id", () => {
    const local = task({
      id: "local-tryon-1",
      statusGroup: "queued",
      progress: 35,
      expectedCount: 2,
      inputThumbnails: ["https://example.com/upload.png"],
      thumbnails: ["https://example.com/upload.png"],
    });
    const server = task({
      id: "gen-1",
      statusGroup: "running",
      progress: 15,
      expectedCount: 1,
      inputThumbnails: [],
      resultThumbnails: [],
      thumbnails: [],
    });

    expect(reconcileTaskQueueRows([local], [server], "tryon")).toEqual([
      {
        ...server,
        progress: 35,
        expectedCount: 2,
        inputThumbnails: ["https://example.com/upload.png"],
        thumbnails: ["https://example.com/upload.png"],
      },
    ]);
  });

  it("keeps local thumbnails during stale running server refreshes", () => {
    const current = task({
      id: "gen-1",
      progress: 62,
      expectedCount: 2,
      resultCount: 1,
      inputThumbnails: ["https://example.com/input.png"],
      resultThumbnails: ["https://example.com/result.png"],
      thumbnails: ["https://example.com/result.png"],
    });
    const staleServer = task({
      id: "gen-1",
      progress: 40,
      expectedCount: 1,
      resultCount: 0,
      inputThumbnails: [],
      resultThumbnails: [],
      thumbnails: [],
    });

    expect(reconcileTaskQueueRows([current], [staleServer], "tryon")).toEqual([
      {
        ...staleServer,
        progress: 62,
        expectedCount: 2,
        resultCount: 1,
        inputThumbnails: ["https://example.com/input.png"],
        resultThumbnails: ["https://example.com/result.png"],
        thumbnails: ["https://example.com/result.png"],
      },
    ]);
  });

  it("removes a task row by id", () => {
    const first = task({ id: "gen-1" });
    const second = task({ id: "gen-2" });

    expect(removeTaskQueueRow([first, second], "gen-1")).toEqual([second]);
  });

  it("builds a server task with apply url and thumbnail counts", () => {
    const item = buildTaskQueueGenerationItem(
      { module: "model", title: "专属模特", defaultExpectedCount: 3, applyPath: "/model" },
      {
        id: "gen-1",
        inputThumbnails: ["https://example.com/in.png"],
        resultThumbnails: ["https://example.com/out-1.png", "https://example.com/out-2.png"],
        statusGroup: "running",
        progress: 42,
      }
    );

    expect(item.applyUrl).toBe("/model?apply=gen-1");
    expect(item.expectedCount).toBe(3);
    expect(item.resultCount).toBe(2);
    expect(item.thumbnails).toEqual(["https://example.com/out-1.png", "https://example.com/out-2.png"]);
  });

  it("normalizes incomplete server rows before exposing them to UI consumers", () => {
    useTaskQueueStore.getState().resetModule("tryon");
    useTaskQueueStore.getState().applyServerRows(
      "tryon",
      [
        {
          id: "gen-missing-arrays",
          module: "tryon",
          title: "服装上身",
          status: "processing",
          statusGroup: "running",
          progress: 20,
          expectedCount: 1,
          resultCount: 0,
          createdAt: "2026-05-16T10:00:00.000Z",
          time: "0:10",
          error: "",
          applyUrl: "/create?apply=gen-missing-arrays",
        } as TaskQueueItem,
      ],
      {
        totalTaskNum: 1,
        finishedTaskNum: 0,
        finishedNeedReadTaskNum: 0,
        runningTaskNum: 1,
        failedTaskNum: 0,
      }
    );

    const row = useTaskQueueStore.getState().modules.tryon.rows[0];
    expect(row.resultThumbnails).toEqual([]);
    expect(row.inputThumbnails).toEqual([]);
    expect(row.thumbnails).toEqual([]);
  });

  it("does not let background running updates steal the selected task", () => {
    useTaskQueueStore.getState().resetModule("tryon");
    useTaskQueueStore.getState().upsertTask(task({ id: "gen-1", progress: 20 }));
    useTaskQueueStore.getState().setSelectedTask("tryon", "gen-1");

    useTaskQueueStore.getState().upsertTask(task({ id: "gen-2", progress: 35 }));
    expect(useTaskQueueStore.getState().modules.tryon.selectedId).toBe("gen-1");

    useTaskQueueStore.getState().patchTask("tryon", "gen-2", { progress: 60 });
    expect(useTaskQueueStore.getState().modules.tryon.selectedId).toBe("gen-1");
  });

  it("keeps already visible result thumbnails when a running patch is empty", () => {
    useTaskQueueStore.getState().resetModule("tryon");
    useTaskQueueStore.getState().upsertTask(task({
      id: "gen-1",
      progress: 70,
      expectedCount: 2,
      resultCount: 1,
      resultThumbnails: ["https://example.com/result.png"],
      thumbnails: ["https://example.com/result.png"],
    }));

    const next = useTaskQueueStore.getState().patchTask("tryon", "gen-1", {
      statusGroup: "running",
      progress: 45,
      expectedCount: 1,
      resultCount: 0,
      resultThumbnails: [],
      thumbnails: [],
    });

    expect(next?.progress).toBe(70);
    expect(next?.expectedCount).toBe(2);
    expect(next?.resultCount).toBe(1);
    expect(next?.resultThumbnails).toEqual(["https://example.com/result.png"]);
    expect(next?.thumbnails).toEqual(["https://example.com/result.png"]);
  });

  it("keeps a newly created task selected when its temporary id is replaced", () => {
    useTaskQueueStore.getState().resetModule("tryon");
    const local = useTaskQueueStore.getState().createOptimisticTask({
      id: "local-tryon-1",
      module: "tryon",
      title: "服装上身",
    });

    expect(useTaskQueueStore.getState().modules.tryon.selectedId).toBe(local.id);

    useTaskQueueStore.getState().replaceTask("tryon", local.id, task({ id: "gen-1", progress: 25 }));
    expect(useTaskQueueStore.getState().modules.tryon.selectedId).toBe("gen-1");
  });

  it("keeps uploaded input thumbnails when replacing a temporary task in the store", () => {
    useTaskQueueStore.getState().resetModule("tryon");
    const local = useTaskQueueStore.getState().createOptimisticTask({
      id: "local-tryon-1",
      module: "tryon",
      title: "鏈嶈涓婅韩",
      expectedCount: 4,
      inputThumbnails: ["https://example.com/upload.png"],
    });

    useTaskQueueStore.getState().replaceTask(
      "tryon",
      local.id,
      task({
        id: "gen-1",
        progress: 25,
        expectedCount: 1,
        inputThumbnails: [],
        resultThumbnails: [],
        thumbnails: [],
      })
    );

    const row = useTaskQueueStore.getState().modules.tryon.rows[0];
    expect(row.id).toBe("gen-1");
    expect(row.expectedCount).toBe(4);
    expect(row.inputThumbnails).toEqual(["https://example.com/upload.png"]);
    expect(row.thumbnails).toEqual(["https://example.com/upload.png"]);
  });
});
