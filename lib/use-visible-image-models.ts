"use client";

import { useEffect, useState } from "react";

let visibleModelsPromise: Promise<Set<string>> | null = null;

function loadVisibleImageModels(): Promise<Set<string>> {
  if (!visibleModelsPromise) {
    visibleModelsPromise = fetch("/api/model-catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        const rawModels: unknown = payload?.models;
        const models: string[] = Array.isArray(rawModels)
          ? (rawModels as unknown[]).map((item) => String(item))
          : [];
        return new Set<string>(models);
      })
      .catch(() => new Set<string>());
  }
  return visibleModelsPromise;
}

export function useVisibleImageModels() {
  const [visibleModels, setVisibleModels] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    void loadVisibleImageModels().then((models) => {
      if (active) setVisibleModels(models);
    });
    return () => {
      active = false;
    };
  }, []);

  return {
    visibleModels,
    isReady: visibleModels !== null,
  };
}

export function filterVisibleModelOptions<T extends { value: string }>(
  options: readonly T[],
  visibleModels: Set<string> | null,
): T[] {
  if (!visibleModels) return [...options];
  return options.filter((option) => visibleModels.has(option.value));
}
