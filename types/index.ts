// ---- User & Auth ----
export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  created_at: string;
}

// ---- Model (人脸模特) ----
export interface TryOnModel {
  id: string;
  name: string;
  image_url: string;
  gender: "male" | "female" | "unisex";
  is_preset: boolean;
  user_id: string | null;
}

// ---- Reference Image (参考图) ----
export interface ReferenceImage {
  id: string;
  url: string;
  label: string;
  category: "pose" | "scene" | "style";
  is_preset: boolean;
  user_id: string | null;
}

// ---- Generation ----
export type GenerationStatus =
  | "uploading"
  | "queued"
  | "processing_tryon"
  | "processing_face_swap"
  | "completed"
  | "failed";

export interface Generation {
  id: string;
  user_id: string;
  clothing_urls: string[];
  model_face_url: string | null;
  reference_url: string | null;
  result_urls: string[];
  status: GenerationStatus;
  error_message: string | null;
  credits_used: number;
  credits_cost: number;
  ai_model: string;
  image_size: string;
  created_at: string;
  completed_at: string | null;
}

// ---- Workflow State (Zustand store) ----
export interface TryOnWorkflowState {
  step: 1 | 2 | 3 | 4 | 5;
  clothingFiles: File[];
  clothingPreviews: string[];
  selectedModel: TryOnModel | null;
  referenceImage: ReferenceImage | null;
  isGenerating: boolean;
  generationProgress: number;
  resultUrls: string[];
  error: string | null;
}
