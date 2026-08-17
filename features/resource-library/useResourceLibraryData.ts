"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchResourceAssets, fetchResourceFacets, fetchResourcePrompts } from "./api";
import type {
  ResourceAsset,
  ResourceAssetsQuery,
  ResourceLibraryFacets,
  ResourcePrompt,
  ResourcePromptsQuery,
} from "./types";

export type ResourceQueryState = "idle" | "loading" | "ready" | "empty" | "error";

const EMPTY_FACETS: ResourceLibraryFacets = { modules: [], media: [], views: [] };

export function useResourceAssets(query: ResourceAssetsQuery, enabled = true) {
  const [items, setItems] = useState<ResourceAsset[]>([]);
  const [state, setState] = useState<ResourceQueryState>(enabled ? "loading" : "idle");
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    const id = ++requestId.current;
    setState("loading");
    setError(null);
    try {
      const result = await fetchResourceAssets({ ...query, cursor: null }, signal);
      if (requestId.current !== id) return;
      setItems(result.items);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setState(result.items.length ? "ready" : "empty");
    } catch (cause) {
      if (signal?.aborted || requestId.current !== id) return;
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setState("error");
    }
  }, [enabled, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) {
      setState("idle");
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchResourceAssets({ ...query, cursor: nextCursor });
      setItems((current) => {
        const seen = new Set(current.map((asset) => asset.id));
        return [...current, ...result.items.filter((asset) => !seen.has(asset.id))];
      });
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, hasMore, loadingMore, nextCursor, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    setItems,
    state,
    error,
    hasMore,
    loadingMore,
    reload: () => load(),
    loadMore,
  };
}

export function useResourceFacets(enabled = true) {
  const [facets, setFacets] = useState<ResourceLibraryFacets>(EMPTY_FACETS);
  const [state, setState] = useState<ResourceQueryState>(enabled ? "loading" : "idle");

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    setState("loading");
    try {
      setFacets(await fetchResourceFacets(signal));
      setState("ready");
    } catch {
      if (!signal?.aborted) setState("error");
    }
  }, [enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { facets, state, reload: () => reload() };
}

export function useResourcePrompts(query: ResourcePromptsQuery = {}, enabled = true) {
  const [items, setItems] = useState<ResourcePrompt[]>([]);
  const [state, setState] = useState<ResourceQueryState>(enabled ? "loading" : "idle");
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const queryKey = JSON.stringify(query);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    setState("loading");
    setError(null);
    try {
      const result = await fetchResourcePrompts({ ...query, cursor: null }, signal);
      setItems(result.items);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setState(result.items.length ? "ready" : "empty");
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setState("error");
    }
  }, [enabled, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchResourcePrompts({ ...query, cursor: nextCursor });
      setItems((current) => {
        const seen = new Set(current.map((prompt) => prompt.id));
        return [...current, ...result.items.filter((prompt) => !seen.has(prompt.id))];
      });
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, hasMore, loadingMore, nextCursor, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    setItems,
    state,
    error,
    hasMore,
    loadingMore,
    reload: () => reload(),
    loadMore,
  };
}
