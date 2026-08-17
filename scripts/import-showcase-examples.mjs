import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : "lib/showcase-data/general-image-image-to-image.seed.json";
const inputPaths = args.filter((value, index) => value !== "--out" && index !== outputIndex + 1);

if (!inputPaths.length) {
  throw new Error("Usage: node scripts/import-showcase-examples.mjs page1.json page2.json --out <file>");
}

const seen = new Set();
const items = inputPaths.flatMap((inputPath) => {
  const document = JSON.parse(readFileSync(resolve(inputPath), "utf8").replace(/^\uFEFF/, ""));
  const list = Array.isArray(document?.data?.list) ? document.data.list : [];
  return list.map(normalizeItem).filter(Boolean);
}).filter((item) => {
  if (seen.has(item.id)) return false;
  seen.add(item.id);
  return true;
}).map((item, index) => ({ ...item, sortOrder: index }));

mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), `${JSON.stringify({
  version: 1,
  module: "general-image-image-to-image",
  enabled: true,
  items,
}, null, 2)}\n`, "utf8");

console.log(`Imported ${items.length} showcase examples from ${inputPaths.map((inputPath) => basename(inputPath)).join(", ")}`);
console.log(`Written ${resolve(outputPath)}`);

function normalizeItem(item, index) {
  const imageUrl = cleanUrl(item?.resultImageUrl || item?.coverImageUrl || item?.testImageUrl);
  const prompt = cleanText(item?.algorithmQuery?.prompt || parseInputConfig(item?.inputConfig)?.prompt);
  if (!imageUrl || !prompt) return null;

  const title = prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || `创作示例 ${index + 1}`;
  const ratio = normalizeRatio(item?.renderAspectRatio || item?.algorithmQuery?.aspect_ratio);
  const clarity = cleanText(item?.algorithmQuery?.clarity).toUpperCase() || "1K";
  const id = `showcase-${String(item?.id || `${Date.now()}-${index}`)}`;

  return {
    id,
    enabled: true,
    sortOrder: index,
    title: title.slice(0, 72),
    imageUrl,
    referenceImageUrls: [],
    prompt: prompt.slice(0, 4000),
    model: "GPT Image 2",
    aspectRatio: ratio,
    imageSize: clarity,
    authorName: cleanText(item?.userName) || "Pixel Diffusion",
    authorAvatarUrl: cleanUrl(item?.userPictureUrl),
    publishedAt: cleanText(item?.publishTime || item?.createTime),
    views: toNonNegativeInteger(item?.caseViewCount),
    createCount: toNonNegativeInteger(item?.caseGenerateCount),
    sourceId: String(item?.id || ""),
  };
}

function parseInputConfig(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanUrl(value) {
  const url = cleanText(value);
  return /^https:\/\//i.test(url) ? url : "";
}

function normalizeRatio(value) {
  const text = cleanText(value).replace(/\s+/g, "");
  const match = text.match(/^(\d+(?:\.\d+)?)[:/]?(\d+(?:\.\d+)?)$/);
  if (!match) return "3:4";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return "3:4";
  const ratio = width / height;
  const candidates = [
    ["1:1", 1],
    ["3:4", 0.75],
    ["4:3", 4 / 3],
    ["4:5", 0.8],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
  ];
  return candidates.reduce((best, candidate) => Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio) ? candidate : best)[0];
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}
