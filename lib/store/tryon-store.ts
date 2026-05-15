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
  setPartialResult: (urls: string[]) => void;
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

/**
 * 释放 blob URL 防止内存泄漏
 */
function revokeBlobUrls(urls: string[]) {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
}

export const useTryOnStore = create<TryOnStore>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setClothing: (files, previews) => {
    // 释放旧的 blob URLs
    revokeBlobUrls(get().clothingPreviews);
    set({ clothingFiles: files, clothingPreviews: previews });
  },

  addClothing: (file, preview) =>
    set((s) => ({
      clothingFiles: [...s.clothingFiles, file],
      clothingPreviews: [...s.clothingPreviews, preview],
    })),

  removeClothing: (index) =>
    set((s) => {
      const removedPreview = s.clothingPreviews[index];
      // 释放被移除的 blob URL
      if (removedPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(removedPreview);
      }
      return {
        clothingFiles: s.clothingFiles.filter((_, i) => i !== index),
        clothingPreviews: s.clothingPreviews.filter((_, i) => i !== index),
      };
    }),

  setSelectedModel: (model) => set({ selectedModel: model }),

  setReferenceImage: (ref) => set({ referenceImage: ref }),

  startGeneration: () =>
    set({ isGenerating: true, generationProgress: 0, resultUrls: [], error: null }),

  updateProgress: (progress) => set({ generationProgress: progress }),

  setPartialResult: (urls) =>
    set({
      resultUrls: urls,
      error: null,
    }),

  setResult: (urls) =>
    set({
      resultUrls: urls,
      isGenerating: false,
      generationProgress: 100,
    }),

  setPromptUsed: (prompt) => set({ promptUsed: prompt }),

  setError: (error) =>
    set({ error, isGenerating: false }),

  reset: () => {
    // 释放所有 blob URLs
    const state = get();
    revokeBlobUrls(state.clothingPreviews);
    set(initialState);
  },
}));
