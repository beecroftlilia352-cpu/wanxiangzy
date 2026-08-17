"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ensureResourceFavoriteStatus,
  getResourceFavoriteSnapshot,
  subscribeResourceFavorite,
  toggleResourceFavorite,
} from "@/components/resource-library/resource-favorite-store";
import {
  getResourceFavoriteKey,
  type ResourceFavoriteDescriptor,
} from "@/components/resource-library/resource-favorite-types";

const DISABLED_STATE = {
  isSaved: false,
  isPending: false,
  isChecking: false,
  assetId: null,
  error: null,
};

export function useResourceFavorite(descriptor: ResourceFavoriteDescriptor | null | undefined) {
  const key = useMemo(
    () => descriptor ? getResourceFavoriteKey(descriptor) : "",
    [descriptor],
  );
  const subscribe = useCallback(
    (listener: () => void) => key ? subscribeResourceFavorite(key, listener) : () => undefined,
    [key],
  );
  const getSnapshot = useCallback(
    () => key ? getResourceFavoriteSnapshot(key) : DISABLED_STATE,
    [key],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (descriptor) ensureResourceFavoriteStatus(descriptor);
  }, [descriptor]);

  const toggle = useCallback(async () => {
    if (!descriptor) return;
    await toggleResourceFavorite(descriptor);
  }, [descriptor]);

  return { ...state, toggle, isAvailable: Boolean(descriptor) };
}
