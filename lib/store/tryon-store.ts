"use client";

import { create } from "zustand";
import type { TryOnModel, ReferenceImage } from "@/types";

interface TryOnStore {
  // ---- Workflow State ----
  step: 1 | 2 | 3 | 4 | 5;
  clothingFiles: File[];
  clothingPreviews: string[];
  selectedModel: TryOnModel | null;
  referenceImage: ReferenceImage | null;
  isGenerating: boolean;
  generationProgress: number;
  resultUrls: string[];
  promptUsed: string;
  error: string | null;

  // ---- Actions ----
  setStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setClothing: (files: File[], previews: string[]) => void;
  addClothing: (file: File, preview: string) => void;
  removeClothing: (index: number) => void;
  setSelectedModel: (model: TryOnModel | null) => void;
  setReferenceImage: (ref: ReferenceImage | null) => void;
  startGeneration: () => void;
  updateProgress: (progress: number) => void;
  setResult: (urls: string[]) => void;
  setPromptUsed: (prompt: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: 1 as const,
  clothingFiles: [],
  clothingPreviews: [],
  selectedModel: null,
  referenceImage: null,
  isGenerating: false,
  generationProgress: 0,
  resultUrls: [],
  promptUsed: "",
  error: null,
};

export const useTryOnStore = create<TryOnStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setClothing: (files, previews) =>
    set({ clothingFiles: files, clothingPreviews: previews }),

  addClothing: (file, preview) =>
    set((s) => ({
      clothingFiles: [...s.clothingFiles, file],
      clothingPreviews: [...s.clothingPreviews, preview],
    })),

  removeClothing: (index) =>
    set((s) => ({
      clothingFiles: s.clothingFiles.filter((_, i) => i !== index),
      clothingPreviews: s.clothingPreviews.filter((_, i) => i !== index),
    })),

  setSelectedModel: (model) => set({ selectedModel: model }),

  setReferenceImage: (ref) => set({ referenceImage: ref }),

  startGeneration: () =>
    set({ isGenerating: true, generationProgress: 0, error: null }),

  updateProgress: (progress) => set({ generationProgress: progress }),

  setResult: (urls) =>
    set({
      resultUrls: urls,
      isGenerating: false,
      generationProgress: 100,
    }),

  setPromptUsed: (prompt) => set({ promptUsed: prompt }),

  setError: (error) =>
    set({ error, isGenerating: false }),

  reset: () => set(initialState),
}));
