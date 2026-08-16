"use client";

import { useMemo } from "react";
import {
  createGenericImagePreviewSession,
  type ImagePreviewReference,
  type ImagePreviewSession,
} from "@/lib/studio-image-preview";
import type { TaskStatusGroup } from "@/lib/task-queue";

/**
 * Thin wrapper around `createGenericImagePreviewSession` that:
 *   - memoizes the session (so child components don't re-render when inputs
 *     haven't changed)
 *   - auto-derives `statusGroup` from `isGenerating` when omitted — every
 *     call site in the codebase duplicates the
 *     `statusGroup: isGenerating ? "running" : undefined` ternary, which
 *     is easy to forget when the caller starts typing manually
 *   - narrows the input type so callers can't pass module-incompatible
 *     props (e.g. pose-specific fields) by accident
 *
 * For the ~7 modules that just need the standard preview surface, this hook
 * replaces the ~30-line `useMemo(() => createGenericImagePreviewSession({
 * module, title, urls, expectedCount, isGenerating, statusGroup, ... }), [...])`
 * block with a single declarative call.
 */
export type UseStudioPreviewInput = Omit<
  Parameters<typeof createGenericImagePreviewSession>[0],
  "statusGroup"
> & {
  /** When true, sets `statusGroup` to "running" automatically. */
  isGenerating?: boolean;
  /** Explicit override for status group; takes precedence over the `isGenerating` default. */
  statusGroup?: TaskStatusGroup;
  /**
   * Optional convenience: list of references already mapped to the
   * `ImagePreviewReference` shape. Prefer this over `references` when you
   * have an array of `{ url, label?, role? }` instead of the full shape.
   */
  references?: ImagePreviewReference[];
};

export function useStudioPreview(input: UseStudioPreviewInput): ImagePreviewSession {
  const { isGenerating, statusGroup, ...rest } = input;
  // Stable deps: stringify the common array/object inputs so the session
  // doesn't rebuild when callers re-derive `promptImages.map(...)` inline.
  const refsKey = input.references ? stableStringify(input.references) : null;
  const metaKey = input.metaItems ? stableStringify(input.metaItems) : null;
  const errorsKey = input.errors ? stableStringify(input.errors) : null;
  const qualitiesKey = input.qualities ? stableStringify(input.qualities) : null;
  const inputThumbnailsKey = input.inputThumbnails ? stableStringify(input.inputThumbnails) : null;

  return useMemo(() => {
    return createGenericImagePreviewSession({
      ...rest,
      statusGroup: statusGroup ?? (isGenerating ? ("running" as TaskStatusGroup) : undefined),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.module,
    input.title,
    input.urls,
    input.expectedCount,
    input.filenamePrefix,
    isGenerating,
    statusGroup,
    input.promptText,
    input.selectedIndex,
    input.resultTitlePrefix,
    input.aspectRatio,
    refsKey,
    metaKey,
    errorsKey,
    qualitiesKey,
    inputThumbnailsKey,
    input.taskId,
    input.createdAt,
  ]);
}

/**
 * JSON.stringify with sorted keys, so an array of objects produces the
 * same key for the same logical content regardless of key insertion order.
 * Backs the stable memoization in `useStudioPreview`.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}