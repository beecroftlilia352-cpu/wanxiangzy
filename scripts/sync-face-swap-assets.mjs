import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const outputPath = join(root, "lib", "face-swap-assets.generated.json");
const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const DOWNLOAD_TIMEOUT_MS = 45_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_BYTES = 25 * 1024 * 1024;

loadEnv(envPath);

const apiKey = process.env.IMGBB_API_KEY;
if (!apiKey) {
  throw new Error("Missing IMGBB_API_KEY in environment or .env.local");
}

const sampleImages = [
  { id: 9, url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_009.jpg", width: 1600, height: 2400 },
  { id: 10, url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_010.jpg", width: 3942, height: 3942 },
  { id: 11, url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_011.jpg", width: 2500, height: 2500 },
  { id: 12, url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_012.jpg", width: 1800, height: 2400 },
];

const femaleSorts = [1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 21, 22, 23, 24, 25];
const maleSorts = Array.from({ length: 20 }, (_, index) => index + 1);
const library = [
  ...femaleSorts.map((sort, index) => ({
    id: 691 + index,
    gender: "female",
    sort,
    url: `https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/官方模特/官方女模特/text_${String(sort).padStart(5, "0")}_.png`,
  })),
  ...maleSorts.map((sort, index) => ({
    id: 710 + index,
    gender: "male",
    sort: 100 + sort,
    url: `https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/官方模特/官方男模特/text_${String(sort).padStart(5, "0")}_.png`,
  })),
];

const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : {};
const sampleCache = new Map((existing.sampleImages || []).map((item) => [String(item.id), item.url]));
const libraryCache = new Map((existing.library || []).map((item) => [String(item.id), item.url]));

const uploadedSamples = [];
for (const item of sampleImages) {
  uploadedSamples.push({
    id: item.id,
    url: await persist(item.url, `face-swap-sample-${item.id}`, sampleCache.get(String(item.id))),
    width: item.width,
    height: item.height,
  });
}

const uploadedLibrary = [];
for (const item of library) {
  uploadedLibrary.push({
    id: item.id,
    gender: item.gender,
    sort: item.sort,
    url: await persist(item.url, `face-swap-${item.gender}-${item.id}`, libraryCache.get(String(item.id))),
  });
}

writeFileSync(
  outputPath,
  `${JSON.stringify({ sampleImages: uploadedSamples, library: uploadedLibrary }, null, 2)}\n`,
  "utf8"
);

console.log(`Uploaded face swap assets: ${uploadedSamples.length} samples, ${uploadedLibrary.length} faces`);

async function persist(sourceUrl, name, cachedUrl) {
  if (cachedUrl && isImgbbUrl(cachedUrl)) return cachedUrl;

  console.log(`uploading ${name} <- ${basename(new URL(sourceUrl).pathname)}`);
  const base64 = await downloadAsBase64(sourceUrl);
  const form = new FormData();
  form.append("key", apiKey);
  form.append("image", base64);
  form.append("name", name);

  const response = await fetch(IMGBB_API_URL, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`imgbb upload failed ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  if (!data.success || !data.data?.url) {
    throw new Error(`imgbb upload did not return url: ${text.slice(0, 300)}`);
  }
  return data.data.url;
}

async function downloadAsBase64(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 VastWear Asset Sync/1.0",
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`download failed ${response.status}: ${sourceUrl}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) throw new Error(`image too large: ${sourceUrl}`);
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) throw new Error(`image too large: ${sourceUrl}`);
  return Buffer.from(arrayBuffer).toString("base64");
}

function isImgbbUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "i.ibb.co" || host.endsWith(".ibb.co");
  } catch {
    return false;
  }
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}
