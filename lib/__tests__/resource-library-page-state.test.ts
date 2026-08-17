import { describe, expect, it } from "vitest";
import {
  INITIAL_RESOURCE_LIBRARY_PAGE_STATE,
  resourceLibraryPageReducer,
} from "@/features/resource-library/page-state";

describe("resource library page state", () => {
  it("defaults to local uploads", () => {
    expect(INITIAL_RESOURCE_LIBRARY_PAGE_STATE).toEqual({
      tab: "uploads",
      media: "all",
      module: "all",
    });
  });

  it("resets incompatible filters when switching top tabs", () => {
    const filtered = resourceLibraryPageReducer(
      resourceLibraryPageReducer(INITIAL_RESOURCE_LIBRARY_PAGE_STATE, { type: "set-module", module: "pose" }),
      { type: "set-media", media: "video" },
    );
    expect(resourceLibraryPageReducer(filtered, { type: "switch-tab", tab: "prompts" })).toEqual({
      tab: "prompts",
      media: "all",
      module: "all",
    });
  });
});
