import type { ResourceMediaType } from "./types";

export type ResourceLibraryTab = "uploads" | "generated" | "prompts";

export type ResourceLibraryPageState = {
  tab: ResourceLibraryTab;
  media: "all" | ResourceMediaType;
  module: string;
};

export type ResourceLibraryPageAction =
  | { type: "switch-tab"; tab: ResourceLibraryTab }
  | { type: "set-media"; media: "all" | ResourceMediaType }
  | { type: "set-module"; module: string };

export const INITIAL_RESOURCE_LIBRARY_PAGE_STATE: ResourceLibraryPageState = {
  tab: "uploads",
  media: "all",
  module: "all",
};

export function resourceLibraryPageReducer(
  state: ResourceLibraryPageState,
  action: ResourceLibraryPageAction,
): ResourceLibraryPageState {
  if (action.type === "switch-tab") {
    return { tab: action.tab, media: "all", module: "all" };
  }
  if (action.type === "set-media") return { ...state, media: action.media };
  return { ...state, module: action.module };
}
