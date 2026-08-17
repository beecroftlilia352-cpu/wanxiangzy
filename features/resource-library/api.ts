import { uploadImage, uploadVideo } from "@/lib/utils";
import type {
  ResourceAsset,
  ResourceAssetsPage,
  ResourceAssetsQuery,
  ResourceLibraryFacets,
  ResourcePrompt,
  ResourcePromptInput,
  ResourcePromptsPage,
  ResourcePromptsQuery,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAsset(input: unknown, index = 0): ResourceAsset | null {
  const item = asRecord(input);
  const url = asString(item.url) ?? asString(item.imageUrl) ?? asString(item.image_url)
    ?? asString(item.videoUrl) ?? asString(item.video_url);
  if (!url) return null;

  const rawMedia = asString(item.mediaType) ?? asString(item.media_type) ?? asString(item.media);
  const mediaType = rawMedia === "video" ? "video" : "image";
  const rawSource = asString(item.source) ?? asString(item.sourceType) ?? asString(item.source_type);
  const id = asString(item.id) ?? asString(item.assetId) ?? asString(item.asset_id)
    ?? `${rawSource ?? "asset"}:${url}:${index}`;

  const now = new Date().toISOString();
  return {
    id,
    url,
    title: asString(item.title) ?? asString(item.name) ?? "",
    previewUrl: asString(item.previewUrl) ?? asString(item.preview_url) ?? null,
    mediaType,
    sourceType: rawSource === "generation" ? "generation" : "upload",
    moduleKey: asString(item.moduleKey) ?? asString(item.module_key) ?? asString(item.module) ?? null,
    sourceGenerationId: asString(item.sourceGenerationId) ?? asString(item.source_generation_id)
      ?? asString(item.generationId) ?? asString(item.generation_id) ?? null,
    sourceResultIndex: asNumber(item.sourceResultIndex) ?? asNumber(item.source_result_index)
      ?? asNumber(item.resultIndex) ?? asNumber(item.result_index) ?? null,
    groupKey: asString(item.groupKey) ?? asString(item.group_key) ?? null,
    groupTotal: asNumber(item.groupTotal) ?? asNumber(item.group_total) ?? 1,
    originalFilename: asString(item.originalFilename) ?? asString(item.original_filename) ?? null,
    mimeType: asString(item.mimeType) ?? asString(item.mime_type) ?? null,
    byteSize: asNumber(item.byteSize) ?? asNumber(item.byte_size) ?? null,
    savedAt: asString(item.savedAt) ?? asString(item.saved_at) ?? now,
    createdAt: asString(item.createdAt) ?? asString(item.created_at) ?? now,
    updatedAt: asString(item.updatedAt) ?? asString(item.updated_at) ?? now,
    width: asNumber(item.width) ?? null,
    height: asNumber(item.height) ?? null,
    durationMs: asNumber(item.durationMs) ?? asNumber(item.duration_ms) ?? null,
    metadata: asRecord(item.metadata),
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = asString(asRecord(payload).error) ?? `Resource library request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function fetchResourceAssets(
  query: ResourceAssetsQuery,
  signal?: AbortSignal,
): Promise<ResourceAssetsPage> {
  const search = new URLSearchParams();
  if (query.source) search.set("source", query.source);
  if (query.module) search.set("module", query.module);
  if (query.media) search.set("media", query.media);
  if (query.view) search.set("view", query.view);
  if (query.cursor) search.set("cursor", query.cursor);
  search.set("limit", String(query.limit ?? 24));

  const raw = asRecord(await fetchJson(`/api/resource-library/assets?${search}`, { signal }));
  const list = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.assets) ? raw.assets : [];
  const items = list.map(normalizeAsset).filter((asset): asset is ResourceAsset => Boolean(asset));
  return {
    items,
    hasMore: raw.hasMore === true || raw.has_more === true,
    nextCursor: asString(raw.nextCursor) ?? asString(raw.next_cursor) ?? null,
  };
}

function normalizeFacets(value: unknown): ResourceLibraryFacets {
  const raw = asRecord(value);
  const normalizeList = (items: unknown) => (Array.isArray(items) ? items : [])
    .map((entry) => {
      const item = asRecord(entry);
      const key = asString(item.key) ?? asString(item.module) ?? asString(item.media) ?? asString(item.view);
      if (!key) return null;
      return { key, label: asString(item.label) ?? null, count: asNumber(item.count) ?? 0 };
    })
    .filter((item): item is { key: string; label: string | null; count: number } => Boolean(item));

  return {
    modules: normalizeList(raw.modules),
    media: normalizeList(raw.media),
    views: normalizeList(raw.views),
  };
}

export async function fetchResourceFacets(signal?: AbortSignal): Promise<ResourceLibraryFacets> {
  return normalizeFacets(await fetchJson("/api/resource-library/facets", { signal }));
}

export async function registerGeneratedResources(input: {
  generationId: string;
  resultIndex?: number;
  resultIndexes?: number[];
}): Promise<ResourceAsset[]> {
  const raw = asRecord(await fetchJson("/api/resource-library/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  const items = Array.isArray(raw.assets) ? raw.assets : [];
  return items.map(normalizeAsset).filter((asset): asset is ResourceAsset => Boolean(asset));
}

export async function deleteResourceAsset(id: string): Promise<void> {
  await fetchJson(`/api/resource-library/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function uploadLocalResource(file: File): Promise<ResourceAsset> {
  const upload = file.type.startsWith("video/") ? await uploadVideo(file) : await uploadImage(file);
  const registered = normalizeAsset(upload.asset);
  if (registered) return registered;

  if (upload.resource_registration_token) {
    const raw = asRecord(await fetchJson("/api/resource-library/assets/from-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: upload.resource_registration_token }),
    }));
    const retried = normalizeAsset(raw.asset ?? raw);
    if (retried) return retried;
  }

  const now = new Date().toISOString();
  return {
    id: `local:${upload.url}`,
    url: upload.url,
    title: file.name,
    mediaType: file.type.startsWith("video/") ? "video" : "image",
    sourceType: "upload",
    previewUrl: null,
    moduleKey: null,
    sourceGenerationId: null,
    sourceResultIndex: null,
    groupKey: null,
    groupTotal: 1,
    originalFilename: file.name,
    mimeType: file.type || null,
    byteSize: file.size,
    durationMs: null,
    metadata: {},
    savedAt: now,
    createdAt: now,
    updatedAt: now,
    width: upload.width ?? null,
    height: upload.height ?? null,
  };
}

export async function uploadLocalResources(
  files: File[],
  concurrency = 3,
): Promise<{ assets: ResourceAsset[]; errors: Error[] }> {
  const assets: Array<ResourceAsset | undefined> = new Array(files.length);
  const errors: Error[] = [];
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), files.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      try {
        assets[index] = await uploadLocalResource(files[index]);
      } catch (cause) {
        errors.push(cause instanceof Error ? cause : new Error(String(cause)));
      }
    }
  }));

  return { assets: assets.filter((asset): asset is ResourceAsset => Boolean(asset)), errors };
}

function normalizePrompt(input: unknown): ResourcePrompt | null {
  const item = asRecord(input);
  const id = asString(item.id);
  const content = asString(item.content) ?? asString(item.prompt);
  if (!id || !content) return null;
  return {
    id,
    title: asString(item.title) ?? content.slice(0, 20),
    content,
    creationType: asString(item.creationType) ?? asString(item.creation_type) ?? "other",
    moduleKey: asString(item.moduleKey) ?? asString(item.module_key) ?? null,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
    metadata: asRecord(item.metadata),
    createdAt: asString(item.createdAt) ?? asString(item.created_at) ?? new Date().toISOString(),
    updatedAt: asString(item.updatedAt) ?? asString(item.updated_at) ?? new Date().toISOString(),
  };
}

export async function fetchResourcePrompts(
  query: ResourcePromptsQuery = {},
  signal?: AbortSignal,
): Promise<ResourcePromptsPage> {
  const search = new URLSearchParams();
  if (query.creationType) search.set("creationType", query.creationType);
  if (query.module) search.set("module", query.module);
  if (query.q) search.set("q", query.q);
  if (query.cursor) search.set("cursor", query.cursor);
  search.set("limit", String(query.limit ?? 24));
  const raw = asRecord(await fetchJson(`/api/resource-library/prompts?${search}`, { signal }));
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.prompts) ? raw.prompts : [];
  return {
    items: items.map(normalizePrompt).filter((prompt): prompt is ResourcePrompt => Boolean(prompt)),
    hasMore: raw.hasMore === true || raw.has_more === true,
    nextCursor: asString(raw.nextCursor) ?? asString(raw.next_cursor) ?? null,
  };
}

export async function createResourcePrompt(input: ResourcePromptInput): Promise<ResourcePrompt> {
  const raw = asRecord(await fetchJson("/api/resource-library/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  const prompt = normalizePrompt(raw.prompt ?? raw);
  if (!prompt) throw new Error("Invalid resource prompt response");
  return prompt;
}

export async function deleteResourcePrompt(id: string): Promise<void> {
  await fetchJson(`/api/resource-library/prompts/${encodeURIComponent(id)}`, { method: "DELETE" });
}
