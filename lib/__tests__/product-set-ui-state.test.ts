import { describe, expect, it } from "vitest";
import type { ProductSetSettings } from "../product-set";
import {
  buildFavoritePlanApplyState,
  getPlanSourceTabForProductSetState,
  getProductSetModeForPlanSource,
  getSelectedPlanIdForProductSetState,
  normalizeFavoriteProductSetPlan,
  type SavedProductSetPlan,
} from "../product-set-ui-state";

const DEFAULT_SETTINGS: ProductSetSettings = {
  country: "China",
  language: "Chinese",
  platform: "Taobao",
  themeMode: "auto",
  themeColor: "auto",
  fontStyle: "auto",
  stylePackId: "auto",
  extraDescription: "",
  visualDirectorScript: "",
};

function savedPlan(patch: Partial<SavedProductSetPlan> = {}): SavedProductSetPlan {
  return {
    id: "favorite-1",
    name: "Taobao main",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    mode: "custom",
    imageType: "main",
    genCount: 5,
    settings: DEFAULT_SETTINGS,
    selectedTemplateIds: [1, 8, 2, 5, 12],
    customTemplates: [],
    moduleOverrides: [{ key: "preset-1-0", name: "Edited hero" }],
    aiModel: "nano-banana-pro",
    aspectRatio: "1:1",
    imageSize: "4K",
    qualityMode: "advanced",
    planPreview: [],
    ...patch,
  };
}

describe("product set UI state helpers", () => {
  it("normalizes favorite plans without relying on browser storage", () => {
    const plan = normalizeFavoriteProductSetPlan({
      id: "x",
      name: "  Saved draft  ",
      mode: "custom",
      imageType: "details",
      genCount: 99,
      settings: { platform: "Amazon", themeMode: "custom", themeColor: "red", fontStyle: "bold" },
      selectedTemplateIds: [101, "bad", 105],
      customTemplates: [{ id: "custom-1", name: "Custom", imageType: "details", typeDescription: "Layout" }],
      moduleOverrides: [{ key: "ai-details-1", disabled: true }],
      aiModel: "unknown",
      aspectRatio: "not-real",
      imageSize: "8K",
      qualityMode: "advanced",
    }, DEFAULT_SETTINGS);

    expect(plan).toMatchObject({
      id: "x",
      name: "Saved draft",
      mode: "custom",
      imageType: "details",
      genCount: 8,
      selectedTemplateIds: [101, 105],
      aiModel: "gpt-image-2",
      aspectRatio: "3:4",
      imageSize: "1K",
      qualityMode: "advanced",
    });
    expect(plan?.settings.platform).toBe("Amazon");
    expect(plan?.settings.themeMode).toBe("custom");
    expect(plan?.customTemplates).toHaveLength(1);
    expect(plan?.moduleOverrides).toHaveLength(1);
  });

  it("restores a favorite system preset as a complete UI state", () => {
    const state = buildFavoritePlanApplyState(savedPlan(), {
      defaultSettings: DEFAULT_SETTINGS,
      defaultGenCount: 3,
    });

    expect(state.mode).toBe("custom");
    expect(state.selectedPlanId).toBe("taobao-main");
    expect(state.selectedTemplateIds).toEqual([1, 8, 2, 5, 12]);
    expect(state.customTemplates).toEqual([]);
    expect(state.moduleOverrides).toEqual([{ key: "preset-1-0", name: "Edited hero" }]);
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(state.aiModel).toBe("nano-banana-pro");
    expect(state.aspectRatio).toBe("1:1");
    expect(state.imageSize).toBe("4K");
    expect(state.qualityMode).toBe("advanced");
    expect(state.genCount).toBe(5);
    expect(state.planSourceTab).toBe("preset");
  });

  it("keeps smart favorites in smart mode even when old preset ids are present", () => {
    const state = buildFavoritePlanApplyState(savedPlan({
      mode: "smart",
      selectedTemplateIds: [1, 8, 2, 5, 12],
      genCount: 3,
    }), {
      defaultSettings: DEFAULT_SETTINGS,
    });

    expect(state.mode).toBe("smart");
    expect(state.selectedPlanId).toBe("smart");
    expect(state.selectedTemplateIds).toEqual([1, 8, 2, 5, 12]);
    expect(state.genCount).toBe(3);
    expect(state.planSourceTab).toBe("smart");
  });

  it("distinguishes custom uploads from exact system preset selections", () => {
    expect(getSelectedPlanIdForProductSetState({
      mode: "custom",
      imageType: "main",
      selectedTemplateIds: [1, 8, 2, 5, 12],
    })).toBe("taobao-main");
    expect(getSelectedPlanIdForProductSetState({
      mode: "custom",
      imageType: "main",
      selectedTemplateIds: [1, 2],
    })).toBe("custom");
  });

  it("derives the opened plan source tab without mixing smart and presets", () => {
    expect(getPlanSourceTabForProductSetState({
      mode: "smart",
      selectedPlanId: "taobao-main",
    })).toBe("smart");

    expect(getPlanSourceTabForProductSetState({
      mode: "custom",
      selectedPlanId: "taobao-main",
    })).toBe("preset");

    expect(getPlanSourceTabForProductSetState({
      mode: "custom",
      selectedPlanId: "custom",
      customTemplates: [{ id: "custom-1", name: "Model", imageType: "main", aspectRatio: "1:1", typeDescription: "Uploaded model reference" }],
    })).toBe("upload");

    expect(getPlanSourceTabForProductSetState({
      mode: "custom",
      selectedPlanId: "custom",
      fallback: "favorites",
    })).toBe("favorites");
  });

  it("maps plan source tabs to generation modes", () => {
    expect(getProductSetModeForPlanSource("smart")).toBe("smart");
    expect(getProductSetModeForPlanSource("preset")).toBe("custom");
    expect(getProductSetModeForPlanSource("upload")).toBe("custom");
    expect(getProductSetModeForPlanSource("favorites")).toBe("custom");
  });
});
