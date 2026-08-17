import type {
  ResourceLibraryGenerationSelection,
  ResourceLibraryMediaType,
} from "@/lib/resource-library/types";

export type ResourceFavoriteMediaType = ResourceLibraryMediaType;

export type ResourceFavoriteIdentity = ResourceLibraryGenerationSelection;

/**
 * UI-side description of a generated result that can be saved to the resource
 * library. The mutation endpoint deliberately trusts only generationId and
 * resultIndex; the remaining fields are presentation metadata for cards and
 * telemetry, never authoritative storage input.
 */
export type ResourceFavoriteDescriptor = ResourceFavoriteIdentity & {
  url: string;
  moduleKey?: string;
  mediaType?: ResourceFavoriteMediaType;
  title?: string;
};

export type ResourceFavoriteCollectionContext = {
  generationId?: string | null;
  moduleKey?: string;
  mediaType?: ResourceFavoriteMediaType;
  /** The first global result index represented by a grouped/local grid. */
  resultIndexOffset?: number;
};

const GENERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createResourceFavoriteDescriptor(
  context: ResourceFavoriteCollectionContext | null | undefined,
  url: string | null | undefined,
  localIndex: number,
  title?: string,
): ResourceFavoriteDescriptor | null {
  const generationId = context?.generationId?.trim();
  const normalizedUrl = url?.trim();
  const resultIndex = Math.max(0, Math.trunc(localIndex + (context?.resultIndexOffset || 0)));

  if (!generationId || !GENERATION_ID_PATTERN.test(generationId) || !normalizedUrl || !Number.isSafeInteger(resultIndex)) return null;

  return {
    generationId,
    resultIndex,
    url: normalizedUrl,
    moduleKey: context?.moduleKey,
    mediaType: context?.mediaType || "image",
    title,
  };
}

export function getResourceFavoriteKey(identity: ResourceFavoriteIdentity) {
  return `${identity.generationId}:${identity.resultIndex}`;
}
