"use client";

import { useState } from "react";
import { TRYON_CLOTHING_ROLE_LABELS, type TryOnClothingRole } from "@/lib/tryon-upload-rules";
import {
  getTryOnSourceLibraryItems,
  type TryOnSourceLibraryItem,
  type TryOnSourceLibraryRow,
} from "@/lib/tryon-source-library";

type UseTryOnSourceLibraryOptions = {
  isAuthenticated: boolean;
  ensureAuthenticated?: () => Promise<boolean>;
  onUnauthenticated: () => void;
};

export function useTryOnSourceLibrary({
  ensureAuthenticated,
  isAuthenticated,
  onUnauthenticated,
}: UseTryOnSourceLibraryOptions) {
  const [role, setRole] = useState<TryOnClothingRole | null>(null);
  const [items, setItems] = useState<TryOnSourceLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/history?status=completed&limit=24", {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({})) as { rows?: TryOnSourceLibraryRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || "作品库加载失败");
      setItems(getTryOnSourceLibraryItems(Array.isArray(data.rows) ? data.rows : []));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "作品库加载失败");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const open = async (nextRole: TryOnClothingRole) => {
    const authenticated = isAuthenticated || (ensureAuthenticated ? await ensureAuthenticated() : false);
    if (!authenticated) {
      onUnauthenticated();
      return;
    }

    setRole(nextRole);
    void load();
  };

  const close = () => setRole(null);

  return {
    close,
    error,
    isLoading,
    items,
    load,
    open,
    role,
    targetLabel: role ? TRYON_CLOTHING_ROLE_LABELS[role] || "服装" : "服装",
  };
}
