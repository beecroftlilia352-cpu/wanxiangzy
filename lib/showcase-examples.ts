import seed from "@/lib/showcase-data/general-image-image-to-image.seed.json";

export const SHOWCASE_CONFIG_KEY = "studio.showcase.general-image-image-to-image";
export const SHOWCASE_MODULE = "general-image-image-to-image";

export type StudioShowcaseExample = {
  id: string;
  enabled: boolean;
  sortOrder: number;
  title: string;
  imageUrl: string;
  referenceImageUrls: string[];
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  authorName: string;
  authorAvatarUrl: string;
  publishedAt: string;
  views: number;
  createCount: number;
  sourceId: string;
};

export type StudioShowcaseRegistry = {
  configKey: typeof SHOWCASE_CONFIG_KEY;
  module: typeof SHOWCASE_MODULE;
  enabled: boolean;
  activeVersionId: string | null;
  activeVersionStatus: string | null;
  items: StudioShowcaseExample[];
  warnings: string[];
};

export function getBuiltInShowcaseExamples(): StudioShowcaseExample[] {
  return parseShowcaseItems(seed.items);
}

export function parseShowcaseExample(input: unknown): StudioShowcaseExample | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = normalizeText(record.id, 90);
  const imageUrl = normalizeHttpsUrl(record.imageUrl);
  const prompt = normalizeText(record.prompt, 4000);
  if (!id || !imageUrl || !prompt) return null;

  return {
    id,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    sortOrder: normalizeInteger(record.sortOrder, 0, 9999),
    title: normalizeText(record.title, 100) || prompt.split(/\r?\n/)[0]?.slice(0, 100) || "创作示例",
    imageUrl,
    referenceImageUrls: normalizeHttpsUrls(record.referenceImageUrls, 3),
    prompt,
    model: normalizeText(record.model, 60) || "GPT Image 2",
    aspectRatio: normalizeText(record.aspectRatio, 16) || "3:4",
    imageSize: normalizeText(record.imageSize, 16).toUpperCase() || "1K",
    authorName: normalizeText(record.authorName, 80) || "Pixel Diffusion",
    authorAvatarUrl: normalizeHttpsUrl(record.authorAvatarUrl),
    publishedAt: normalizeText(record.publishedAt, 40),
    views: normalizeInteger(record.views, 0, Number.MAX_SAFE_INTEGER),
    createCount: normalizeInteger(record.createCount, 0, Number.MAX_SAFE_INTEGER),
    sourceId: normalizeText(record.sourceId, 90),
  };
}

export function parseShowcaseItems(input: unknown): StudioShowcaseExample[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .map(parseShowcaseExample)
    .filter((item): item is StudioShowcaseExample => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function upsertShowcaseExample(items: StudioShowcaseExample[], input: unknown) {
  const parsed = parseShowcaseExample(input);
  if (!parsed) throw new Error("示例配置字段不完整");
  return parseShowcaseItems([...items.filter((item) => item.id !== parsed.id), parsed]);
}

export function archiveShowcaseExample(items: StudioShowcaseExample[], id: string) {
  if (!items.some((item) => item.id === id)) throw new Error("未找到示例配置");
  return items.filter((item) => item.id !== id);
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeHttpsUrl(value: unknown) {
  const url = normalizeText(value, 1200);
  return /^https:\/\//i.test(url) ? url : "";
}

function normalizeHttpsUrls(value: unknown, maxCount: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeHttpsUrl).filter(Boolean))).slice(0, maxCount);
}

function normalizeInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}
