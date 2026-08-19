"use client";

import { useEffect, useState } from "react";
import {
  registerImageModelCatalog,
  type ImageModelCatalogItem,
} from "@/lib/image-model-catalog";

type VisibleCatalog = { models: Set<string>; catalog: ImageModelCatalogItem[] };
let visibleModelsPromise: Promise<VisibleCatalog> | null = null;

function loadVisibleImageModels(): Promise<VisibleCatalog> {
  if (!visibleModelsPromise) {
    visibleModelsPromise = fetch("/api/model-catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        const rawCatalog: unknown = payload?.catalog;
        const catalog = Array.isArray(rawCatalog)
          ? rawCatalog.filter(isCatalogItem)
          : [];
        const rawModels: unknown = payload?.models;
        const ids = catalog.length
          ? catalog.map((item) => item.id)
          : Array.isArray(rawModels) ? (rawModels as unknown[]).map(String) : [];
        registerImageModelCatalog(catalog);
        return { models: new Set(ids), catalog };
      })
      .catch(() => ({ models: new Set<string>(), catalog: [] }));
  }
  return visibleModelsPromise;
}

export function useVisibleImageModels() {
  const [result, setResult] = useState<VisibleCatalog | null>(null);

  useEffect(() => {
    let active = true;
    void loadVisibleImageModels().then((value) => {
      if (active) setResult(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return {
    visibleModels: result?.models || null,
    catalog: result?.catalog || null,
    isReady: result !== null,
  };
}

function isCatalogItem(value: unknown): value is ImageModelCatalogItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<ImageModelCatalogItem>;
  return typeof item.id === "string"
    && typeof item.displayName === "string"
    && Array.isArray(item.supportedSizes)
    && Boolean(item.creditPrices && typeof item.creditPrices === "object")
    && Array.isArray(item.capabilities)
    && (item.iconUrl === undefined || typeof item.iconUrl === "string")
    && (item.coverUrl === undefined || typeof item.coverUrl === "string");
}

export function filterVisibleModelOptions<T extends { value: string }>(
  options: readonly T[],
  visibleModels: Set<string> | null,
): T[] {
  if (!visibleModels) return [...options];
  return options.filter((option) => visibleModels.has(option.value));
}
