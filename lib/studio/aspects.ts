import type { AspectRatio } from "@/lib/api/lingya";
import type { AspectRatioOption } from "@/components/studio/AspectRatioSelector";

/**
 * Central source of truth for studio aspect-ratio presets.
 *
 * Each module opts into a preset below (instead of redefining its own
 * `ASPECTS` array) so that adding / renaming / reordering a ratio happens in
 * exactly one place. The `AspectRatioSelector` is value-driven and agnostic
 * to where the option array came from, so this layer is the only one modules
 * need to touch.
 *
 * Per-module subsets intentionally encode the model-API reality (e.g.
 * garment-3d only supports auto/1:1/3:4). Keep them aligned with
 * `lib/api/lingya.ts::AspectRatio` and any per-model overrides in
 * `getSupportedImageSizes`.
 */
export const ALL_ASPECT_RATIOS = [
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
] as const satisfies readonly AspectRatio[];

/** Default label fallback for locales that haven't translated a ratio key. */
const RATIO_FALLBACK_LABEL: Record<AspectRatio, string> = {
  auto: "Auto",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
  "3:2": "3:2",
  "2:3": "2:3",
  "4:5": "4:5",
  "5:4": "5:4",
  "21:9": "21:9",
};

/**
 * Build an `AspectRatioOption[]` for a subset of ratios, with a `labelKey`
 * prefixed by the module namespace (e.g. `Model.aspects.34`). Falls back to
 * a hardcoded English label when a translation key resolves to nothing.
 */
export function buildAspectOptions(
  values: readonly AspectRatio[],
  prefix: string,
  overrides: Partial<Record<AspectRatio, Pick<AspectRatioOption, "label" | "labelKey" | "disabled">>> = {}
): AspectRatioOption<AspectRatio>[] {
  return values.map((value) => {
    const override = overrides[value] ?? {};
    return {
      value,
      labelKey: override.labelKey ?? `${prefix}.${value.replace(":", "")}`,
      label: override.label ?? RATIO_FALLBACK_LABEL[value],
      disabled: override.disabled,
    };
  });
}

// ── Module presets ─────────────────────────────────────────────────────────
// Each export mirrors a module's historical `ASPECTS` array. New modules
// should compose one of these rather than re-declaring the same list.

/** create / tryon / face-swap / pose / grass / model-background / outfit-fusion / video */
export const STUDIO_DEFAULT_ASPECTS: readonly AspectRatio[] = ["auto", "4:3", "3:4", "9:16", "16:9", "1:1"];

/** model — narrow set focused on portrait shots */
export const MODEL_ASPECTS: readonly AspectRatio[] = ["auto", "3:4", "1:1", "4:3"];

/** general-image — broadest preset, covers e-commerce + content */
export const GENERAL_IMAGE_ASPECTS: readonly AspectRatio[] = [
  "auto",
  "3:4",
  "4:3",
  "1:1",
  "9:16",
  "16:9",
  "4:5",
];

/** garment-3d — only the three ratios the 3D pipeline supports */
export const GARMENT_3D_ASPECTS: readonly AspectRatio[] = ["auto", "1:1", "3:4"];

/** material-enhancement */
export const MATERIAL_ENHANCEMENT_ASPECTS: readonly AspectRatio[] = ["auto", "3:4", "4:3", "1:1"];

/** product-retouch */
export const PRODUCT_RETOUCH_ASPECTS: readonly AspectRatio[] = ["auto", "1:1", "3:4", "4:5"];

/** product-set / all-category-product-image (main) */
export const PRODUCT_SET_MAIN_ASPECTS: readonly AspectRatio[] = ["auto", "1:1", "3:4", "4:3"];

/** product-set / all-category-product-image (details) */
export const PRODUCT_SET_DETAILS_ASPECTS: readonly AspectRatio[] = ["auto", "3:4", "4:5", "4:3", "1:1"];

/** image-translation — locked to auto in current pipeline */
export const IMAGE_TRANSLATION_ASPECTS: readonly AspectRatio[] = ["auto"];