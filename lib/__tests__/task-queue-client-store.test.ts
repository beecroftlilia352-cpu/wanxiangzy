import { describe, expect, it } from "vitest";

import type { TaskQueueItem } from "../task-queue";
import {
  createOptimisticTaskQueueItem,
  reconcileTaskQueueRows,
  removeTaskQueueRow,
  upsertTaskQueueRow,
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
});
