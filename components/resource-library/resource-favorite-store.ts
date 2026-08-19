"use client";

import {
  removeResourceFavorite,
  requestResourceFavoriteStatuses,
  saveResourceFavorite,
} from "@/components/resource-library/resource-favorite-client";
import {
  getResourceFavoriteKey,
  type ResourceFavoriteDescriptor,
} from "@/components/resource-library/resource-favorite-types";

export type ResourceFavoriteState = {
  isSaved: boolean;
  isPending: boolean;
  isChecking: boolean;
  assetId: string | null;
  error: string | null;
};

const UNKNOWN_STATE: ResourceFavoriteState = Object.freeze({
  isSaved: false,
  isPending: false,
  isChecking: true,
  assetId: null,
  error: null,
});

const stateByKey = new Map<string, ResourceFavoriteState>();
const listenersByKey = new Map<string, Set<() => void>>();
const descriptorQueue = new Map<string, ResourceFavoriteDescriptor>();
const inFlightMutations = new Map<string, Promise<void>>();
let statusFlushScheduled = false;

export function subscribeResourceFavorite(key: string, listener: () => void) {
  const listeners = listenersByKey.get(key) || new Set<() => void>();
  listeners.add(listener);
  listenersByKey.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) listenersByKey.delete(key);
  };
}

export function getResourceFavoriteSnapshot(key: string) {
  return stateByKey.get(key) || UNKNOWN_STATE;
}

export function ensureResourceFavoriteStatus(descriptor: ResourceFavoriteDescriptor) {
  const key = getResourceFavoriteKey(descriptor);
  if (stateByKey.has(key) || descriptorQueue.has(key)) return;
  descriptorQueue.set(key, descriptor);
  scheduleStatusFlush();
}

export function toggleResourceFavorite(descriptor: ResourceFavoriteDescriptor) {
  const key = getResourceFavoriteKey(descriptor);
  const existingMutation = inFlightMutations.get(key);
  if (existingMutation) return existingMutation;

  const previous = stateByKey.get(key) || UNKNOWN_STATE;
  const mutation = previous.isSaved
    ? removeFavorite(key, previous)
    : saveFavorite(key, descriptor, previous);
  inFlightMutations.set(key, mutation);
  const clearMutation = () => {
    if (inFlightMutations.get(key) === mutation) inFlightMutations.delete(key);
  };
  void mutation.then(clearMutation, clearMutation);
  return mutation;
}

export function primeResourceFavorite(
  descriptor: ResourceFavoriteDescriptor,
  input: { saved: boolean; assetId?: string | null },
) {
  setState(getResourceFavoriteKey(descriptor), {
    isSaved: input.saved,
    isPending: false,
    isChecking: false,
    assetId: input.assetId || null,
    error: null,
  });
}

async function saveFavorite(
  key: string,
  descriptor: ResourceFavoriteDescriptor,
  previous: ResourceFavoriteState,
) {
  setState(key, {
    isSaved: true,
    isPending: true,
    isChecking: false,
    assetId: previous.assetId,
    error: null,
  });
  try {
    const assetId = await saveResourceFavorite(descriptor);
    setState(key, {
      isSaved: true,
      isPending: false,
      isChecking: false,
      assetId,
      error: null,
    });
  } catch (error) {
    setState(key, {
      ...previous,
      isPending: false,
      isChecking: false,
      error: error instanceof Error ? error.message : "加入资源库失败",
    });
    throw error;
  }
}

async function removeFavorite(key: string, previous: ResourceFavoriteState) {
  if (!previous.assetId) {
    setState(key, { ...previous, isChecking: true, error: null });
    throw new Error("资源收藏状态尚未加载完成");
  }

  setState(key, {
    isSaved: false,
    isPending: true,
    isChecking: false,
    assetId: previous.assetId,
    error: null,
  });
  try {
    await removeResourceFavorite(previous.assetId);
    setState(key, {
      isSaved: false,
      isPending: false,
      isChecking: false,
      assetId: null,
      error: null,
    });
  } catch (error) {
    setState(key, {
      ...previous,
      isPending: false,
      isChecking: false,
      error: error instanceof Error ? error.message : "移出资源库失败",
    });
    throw error;
  }
}

function scheduleStatusFlush() {
  if (statusFlushScheduled) return;
  statusFlushScheduled = true;
  queueMicrotask(() => {
    statusFlushScheduled = false;
    void flushStatusQueue();
  });
}

async function flushStatusQueue() {
  const descriptors = Array.from(descriptorQueue.values()).slice(0, 100);
  descriptors.forEach((descriptor) => descriptorQueue.delete(getResourceFavoriteKey(descriptor)));
  if (!descriptors.length) return;

  try {
    const statuses = await requestResourceFavoriteStatuses(descriptors);
    statuses.forEach((status) => {
      const key = getResourceFavoriteKey(status);
      if (inFlightMutations.has(key)) return;
      setState(key, {
        isSaved: status.saved,
        isPending: false,
        isChecking: false,
        assetId: status.assetId,
        error: null,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源收藏状态加载失败";
    descriptors.forEach((descriptor) => {
      const key = getResourceFavoriteKey(descriptor);
      if (inFlightMutations.has(key)) return;
      setState(key, {
        isSaved: false,
        isPending: false,
        isChecking: false,
        assetId: null,
        error: message,
      });
    });
  } finally {
    if (descriptorQueue.size) scheduleStatusFlush();
  }
}

function setState(key: string, state: ResourceFavoriteState) {
  stateByKey.set(key, state);
  listenersByKey.get(key)?.forEach((listener) => listener());
}

export function resetResourceFavoriteStoreForTests() {
  stateByKey.clear();
  descriptorQueue.clear();
  inFlightMutations.clear();
  statusFlushScheduled = false;
}
