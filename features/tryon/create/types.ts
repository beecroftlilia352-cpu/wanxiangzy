import type { HistoryJobPayload } from "@/lib/history-apply";
import type { TryOnReferenceAnalysis } from "@/lib/tryon-reference-analysis";
import type { TryOnClothingAnalysis } from "@/lib/tryon-reference-config";
import type { TryOnAgeGroup, TryOnGarmentAudience } from "@/lib/tryon-prompt";
import type { TryOnClothingMode, TryOnClothingRole } from "@/lib/tryon-upload-rules";
import type { ReferenceImage } from "@/types";

export type FavoriteReference = {
  id: string;
  url: string;
  label: string;
  category: "scene" | "style" | "pose";
  is_preset: false;
  user_id: null;
};

export type ReferenceSource = "preset" | "upload" | "favorite" | "history" | "template";

export type SelectedReferenceImage = ReferenceImage & {
  source?: ReferenceSource;
  sceneKey?: string;
  score?: number;
  matchReasons?: string[];
  clothCategories?: string[];
  childReferences?: SelectedReferenceImage[];
  viewTags?: string[];
  cropTags?: string[];
  sceneTags?: string[];
  styleTags?: string[];
};

export type TryOnGenerateOptions = {
  genCountOverride?: number;
  referenceUrlsOverride?: string[];
  referenceAnalysesOverride?: TryOnReferenceAnalysis[];
  expectedCountOverride?: number;
  retryResultIndex?: number;
  toastMessage?: string;
};

export type ReferenceTemplate = {
  id: string;
  name: string;
  coverUrl: string;
  references: SelectedReferenceImage[];
};

export type CustomReferenceUpload = {
  id: string;
  preview: string;
  label: string;
  status: "uploading" | "ready" | "error";
  url?: string;
  error?: string;
};

export type ClothingAnalysisCacheEntry = {
  analysis: TryOnClothingAnalysis | null;
  source: "yunwu" | "cache" | "fallback" | "history";
  error?: string | null;
};

export type ReferenceAnalysisCacheEntry = {
  analyses: TryOnReferenceAnalysis[];
  source: "yunwu" | "cache" | "fallback" | "history";
  error?: string | null;
  reasonText?: string | null;
};

export type SystemReferenceApiItem = {
  id?: string;
  sceneKey?: string;
  name?: string;
  imageUrl?: string;
  reference?: {
    id?: string;
    url?: string;
    label?: string;
    category?: unknown;
    is_preset?: boolean;
    user_id?: string | null;
  };
  score?: number;
  matchReasons?: string[];
  clothCategories?: string[];
  childReferences?: Array<{
    id?: string;
    url?: string;
    label?: string;
    category?: unknown;
    is_preset?: boolean;
    user_id?: string | null;
    source?: unknown;
  }>;
  viewTags?: string[];
  cropTags?: string[];
  sceneTags?: string[];
  styleTags?: string[];
};

export type TryOnHistoryPayload = Extract<HistoryJobPayload, { kind: "tryon" }>;

export type ClothingItemState = {
  file: File;
  preview: string;
  url: string;
  role: TryOnClothingRole;
};

export type AnalysisCacheKeyParams = {
  urls: string[];
  clothingMode: TryOnClothingMode;
  clothingRoles: TryOnClothingRole[];
  garmentAudience: TryOnGarmentAudience;
  ageGroup: TryOnAgeGroup;
};
