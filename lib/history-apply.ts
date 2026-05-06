import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import type { Garment3dDisplayStyle, ModelShootStyle, PoseSeriesStyle } from "@/lib/module-style-presets";
import type { AutoDesignSettings, TryOnSceneMode } from "@/lib/tryon-scene";
import type { TryOnAgeGroup, TryOnGarmentAudience } from "@/lib/tryon-prompt";
import type { TryOnClothingMode, TryOnClothingRole } from "@/lib/tryon-upload-rules";
import type { GrassPayloadBase } from "@/lib/grass-planting";
import type { ModelBackgroundPayloadBase } from "@/lib/model-background";

export const HISTORY_APPLY_KEY = "vastweargen:apply-generation";

export type HistoryJobPayload =
  | {
      kind: "tryon";
      clothingUrls: string[];
      clothingMode?: TryOnClothingMode;
      clothingRoles?: TryOnClothingRole[];
      garmentAudience?: TryOnGarmentAudience;
      ageGroup?: TryOnAgeGroup;
      modelFaceUrl?: string | null;
      referenceUrl?: string | null;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      style?: string;
      rawPrompt?: string;
      sceneMode?: TryOnSceneMode;
      autoDesign?: AutoDesignSettings;
      genCount: number;
    }
  | {
      kind: "model";
      referenceUrls: string[];
      hairReferenceUrl?: string | null;
      hairColorReferenceUrl?: string | null;
      gender?: "female" | "male";
      modelStyle?: ModelShootStyle;
      hairStyle?: string | null;
      hairColor?: string | null;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
  | ({ kind: "grass" } & GrassPayloadBase)
  | ({ kind: "modelBackground" } & ModelBackgroundPayloadBase)
  | {
      kind: "pose";
      mainImageUrl: string;
      aiModel: LingyaModel;
      imageSize: ImageSize;
      prompt: string;
      varyExpression?: boolean;
      poseStyle?: PoseSeriesStyle;
    }
  | {
      kind: "garment3d";
      garmentUrl: string;
      referenceUrl?: string | null;
      garmentType?: string;
      outputMode?: "reference" | "prompt";
      displayStyle?: Garment3dDisplayStyle;
      userPrompt?: string;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    }
  | {
      kind: "faceSwap";
      sourceUrl: string;
      faceUrl: string;
      aiModel: LingyaModel;
      aspectRatio: AspectRatio;
      imageSize: ImageSize;
      prompt: string;
      genCount: number;
    };

export function getApplyPath(kind: HistoryJobPayload["kind"]) {
  if (kind === "tryon") return "/create";
  if (kind === "grass") return "/grass";
  if (kind === "modelBackground") return "/model-background";
  if (kind === "garment3d") return "/garment-3d";
  if (kind === "faceSwap") return "/face-swap";
  if (kind === "model") return "/model";
  return "/pose";
}

export function saveApplyPayload(payload: HistoryJobPayload) {
  window.localStorage.setItem(HISTORY_APPLY_KEY, JSON.stringify(payload));
}

export function takeApplyPayload<K extends HistoryJobPayload["kind"]>(
  kind: K
): Extract<HistoryJobPayload, { kind: K }> | null {
  const raw = window.localStorage.getItem(HISTORY_APPLY_KEY);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as HistoryJobPayload;
    if (payload.kind !== kind) return null;
    window.localStorage.removeItem(HISTORY_APPLY_KEY);
    return payload as Extract<HistoryJobPayload, { kind: K }>;
  } catch {
    window.localStorage.removeItem(HISTORY_APPLY_KEY);
    return null;
  }
}
