export type StudioImageEditorToolbarVariant = "erase" | "clothing" | "shoe" | "matting";

export type StudioImageEditorSelectionAction = "smart" | "auto" | "add" | "subtract";

export type StudioImageEditorToolbarConfig = {
  selectionActions: readonly StudioImageEditorSelectionAction[];
  showBrush: boolean;
  showEraser: boolean;
  showShapes: boolean;
};

const TOOLBAR_CONFIGS: Record<StudioImageEditorToolbarVariant, StudioImageEditorToolbarConfig> = {
  erase: {
    selectionActions: [],
    showBrush: true,
    showEraser: true,
    showShapes: true,
  },
  clothing: {
    selectionActions: ["smart", "auto", "add", "subtract"],
    showBrush: true,
    showEraser: true,
    showShapes: false,
  },
  shoe: {
    selectionActions: [],
    showBrush: true,
    showEraser: true,
    showShapes: false,
  },
  matting: {
    selectionActions: ["smart", "auto", "add", "subtract"],
    showBrush: true,
    showEraser: true,
    showShapes: false,
  },
};

export function getStudioImageEditorToolbarConfig(
  variant: StudioImageEditorToolbarVariant,
) {
  return TOOLBAR_CONFIGS[variant];
}

export function resolveStudioImageEditorToolbarVariant(
  variant: StudioImageEditorToolbarVariant | undefined,
  intent: "inpaint" | "matting",
) {
  return variant ?? (intent === "matting" ? "matting" : "erase");
}
