import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE_ROOTS = ["app", "components", "lib"];
const DEFAULT_LOCAL_ROOT = "public";
const DEFAULT_BUCKET = "vasthk";
const DEFAULT_REGION = "oss-cn-hongkong";
const DEFAULT_SITE_ASSET_PREFIX = "site-assets/original";
const DEFAULT_MANIFEST = ".oss-site-assets-manifest.json";
const DEFAULT_CACHE_CONTROL = "public, max-age=604800";
const DEFAULT_CONCURRENCY = 4;
const MAX_ASSET_BYTES = 64 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md", ".mdx"]);
const PLACEHOLDER_HOSTS = new Set(["example.com", "img.example", "provider.example"]);
const ASSET_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
  ".mp4",
]);

loadEnv(join(root, ".env.local"));
loadEnv(join(root, ".env"));

const args = parseArgs(process.argv.slice(2));
const config = resolveConfig(args);
const credentials = args.dryRun ? null : resolveCredentials(args);

const localAssets = args.remoteOnly ? [] : collectLocalAssets(config.localRoot, config.prefix, config.publicBaseUrl);
const remoteAssets = args.localOnly ? [] : collectRemoteAssets(config.sourceRoots, config.prefix, config.publicBaseUrl);
const assets = dedupeAssets([...localAssets, ...remoteAssets]);

if (args.limit > 0) assets.length = Math.min(assets.length, args.limit);

console.log(`Site asset upload`);
console.log(`bucket: ${config.bucket}`);
console.log(`region: ${config.region}`);
console.log(`prefix: ${config.prefix}`);
console.log(`local assets: ${localAssets.length}`);
console.log(`remote assets: ${remoteAssets.length}`);
console.log(`total assets: ${assets.length}`);
console.log(`mode: ${args.dryRun ? "dry-run" : "upload"}`);

if (args.dryRun) {
  printSamples(assets);
  writeManifest(config.manifestPath, buildManifest(config, assets, []));
  console.log(`manifest written: ${displayPath(config.manifestPath)}`);
  process.exit(0);
}

const results = await runWithConcurrency(assets, config.concurrency, (asset) => uploadAsset(asset, config, credentials));
const failures = results.filter((item) => item.status === "failed");
const uploaded = results.filter((item) => item.status === "uploaded");
const skipped = results.filter((item) => item.status === "skipped");

writeManifest(config.manifestPath, buildManifest(config, assets, results));
console.log(`uploaded: ${uploaded.length}`);
console.log(`skipped: ${skipped.length}`);
console.log(`failed: ${failures.length}`);
console.log(`manifest written: ${displayPath(config.manifestPath)}`);

if (args.rewrite) {
  const rewriteCount = rewriteSourceReferences(config.sourceRoots, results);
  console.log(`rewrite replacements: ${rewriteCount}`);
}

if (failures.length) {
  for (const failure of failures.slice(0, 10)) {
    console.error(`failed: ${failure.source} -> ${failure.error}`);
  }
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    accessFile: "",
    cacheControl: DEFAULT_CACHE_CONTROL,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    force: false,
    limit: 0,
    localOnly: false,
    localRoot: DEFAULT_LOCAL_ROOT,
    manifest: DEFAULT_MANIFEST,
    prefix: "",
    remoteOnly: false,
    rewrite: false,
    sourceRoots: DEFAULT_SOURCE_ROOTS,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value after ${arg}`);
      return value;
    };

    if (arg === "--access-file") parsed.accessFile = next();
    else if (arg === "--cache-control") parsed.cacheControl = next();
    else if (arg === "--concurrency") parsed.concurrency = Number(next());
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--limit") parsed.limit = Number(next());
    else if (arg === "--local-only") parsed.localOnly = true;
    else if (arg === "--local-root") parsed.localRoot = next();
    else if (arg === "--manifest") parsed.manifest = next();
    else if (arg === "--prefix") parsed.prefix = next();
    else if (arg === "--remote-only") parsed.remoteOnly = true;
    else if (arg === "--rewrite") parsed.rewrite = true;
    else if (arg === "--source-roots") parsed.sourceRoots = splitCsv(next());
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.localOnly && parsed.remoteOnly) {
    throw new Error("Use only one of --local-only or --remote-only");
  }
  parsed.concurrency = Number.isFinite(parsed.concurrency) && parsed.concurrency > 0 ? parsed.concurrency : DEFAULT_CONCURRENCY;
  parsed.limit = Number.isFinite(parsed.limit) && parsed.limit > 0 ? parsed.limit : 0;
  return parsed;
}

function resolveConfig(args) {
  const bucket = process.env.ALIYUN_OSS_BUCKET || DEFAULT_BUCKET;
  const region = process.env.ALIYUN_OSS_REGION || DEFAULT_REGION;
  const publicBaseUrl = normalizeBaseUrl(
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL || `https://${bucket}.${region}.aliyuncs.com`
  );
  return {
    bucket,
    cacheControl: args.cacheControl,
    concurrency: args.concurrency,
    endpoint: process.env.ALIYUN_OSS_ENDPOINT?.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || `${bucket}.${region}.aliyuncs.com`,
    force: args.force,
    localRoot: resolveFromRoot(args.localRoot),
    manifestPath: resolveFromRoot(args.manifest),
    prefix: cleanObjectPath(args.prefix || process.env.ALIYUN_OSS_SITE_ASSET_PREFIX || DEFAULT_SITE_ASSET_PREFIX),
    publicBaseUrl,
    region,
    sourceRoots: args.sourceRoots.map(resolveFromRoot).filter(existsSync),
  };
}

function resolveCredentials(args) {
  const fileCredentials = args.accessFile ? parseAccessFile(resolveFromRoot(args.accessFile)) : {};
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID || fileCredentials.accessKeyId;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || fileCredentials.accessKeySecret;
  const securityToken = process.env.ALIYUN_OSS_SECURITY_TOKEN || fileCredentials.securityToken || "";

  if (!accessKeyId || !accessKeySecret) {
    throw new Error("Missing ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET. Use .env.local or --access-file.");
  }

  return { accessKeyId, accessKeySecret, securityToken };
}

function collectLocalAssets(localRoot, prefix, publicBaseUrl) {
  if (!existsSync(localRoot)) return [];

  return walkFiles(localRoot)
    .filter((filePath) => ASSET_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .map((filePath) => {
      const rel = toPosix(relative(localRoot, filePath));
      const objectKey = `${prefix}/${cleanObjectPath(rel)}`;
      return {
        kind: "local",
        source: `/${rel}`,
        filePath,
        objectKey,
        url: `${publicBaseUrl}/${encodeObjectKey(objectKey)}`,
        bytes: statSync(filePath).size,
      };
    });
}

function collectRemoteAssets(sourceRoots, prefix, publicBaseUrl) {
  const urls = new Map();
  const sourceFiles = sourceRoots.flatMap((sourceRoot) => walkFiles(sourceRoot))
    .filter((filePath) => TEXT_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .filter((filePath) => !isIgnoredSourceFile(filePath));

  const urlPattern = /https?:\/\/[^\s"'`<>)]+?\.(?:avif|gif|ico|jpeg|jpg|png|svg|webp)(?:\?[^\s"'`<>)]+)?/gi;
  for (const filePath of sourceFiles) {
    const text = readFileSync(filePath, "utf8");
    for (const match of text.matchAll(urlPattern)) {
      const sourceUrl = trimUrl(match[0]);
      if (isPlaceholderRemoteUrl(sourceUrl)) continue;
      if (isAlreadyInPrefix(sourceUrl, publicBaseUrl, prefix)) continue;
      if (!urls.has(sourceUrl)) urls.set(sourceUrl, new Set());
      urls.get(sourceUrl).add(displayPath(filePath));
    }
  }

  return [...urls.entries()].map(([sourceUrl, files]) => {
    const objectKey = buildRemoteObjectKey(prefix, sourceUrl);
    return {
      kind: "remote",
      source: sourceUrl,
      sourceFiles: [...files],
      objectKey,
      url: `${publicBaseUrl}/${encodeObjectKey(objectKey)}`,
    };
  });
}

function dedupeAssets(assets) {
  const seen = new Set();
  return assets.filter((asset) => {
    const key = `${asset.kind}:${asset.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function uploadAsset(asset, config, credentials) {
  try {
    if (!config.force && await objectExists(asset.objectKey, config, credentials)) {
      console.log(`skip ${asset.kind}: ${asset.source}`);
      return { ...asset, status: "skipped" };
    }

    const payload = asset.kind === "local"
      ? readLocalPayload(asset.filePath)
      : await downloadRemotePayload(asset.source);

    if (payload.bytes.byteLength > MAX_ASSET_BYTES) {
      throw new Error(`asset too large: ${payload.bytes.byteLength} bytes`);
    }

    await putObject(asset.objectKey, payload.bytes, payload.contentType, config, credentials);
    console.log(`upload ${asset.kind}: ${asset.source}`);
    return { ...asset, status: "uploaded", bytes: payload.bytes.byteLength, contentType: payload.contentType };
  } catch (error) {
    return { ...asset, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function objectExists(objectKey, config, credentials) {
  const response = await ossFetch("HEAD", objectKey, undefined, config, credentials);
  if (response.status === 200) return true;
  if (response.status === 404) return false;
  return false;
}

async function putObject(objectKey, bytes, contentType, config, credentials) {
  const response = await ossFetch("PUT", objectKey, bytes, config, credentials, {
    "Cache-Control": config.cacheControl,
    "Content-Type": contentType,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OSS PUT ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function ossFetch(method, objectKey, body, config, credentials, headers = {}) {
  const objectPath = `/${encodeObjectKey(objectKey)}`;
  const date = new Date().toUTCString();
  const requestHeaders = {
    ...headers,
    ...(credentials.securityToken ? { "x-oss-security-token": credentials.securityToken } : {}),
    Date: date,
  };
  const contentType = requestHeaders["Content-Type"] || "";
  const canonicalizedOssHeaders = Object.entries(requestHeaders)
    .filter(([key]) => key.toLowerCase().startsWith("x-oss-"))
    .map(([key, value]) => [key.toLowerCase(), String(value).trim()])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
  const stringToSign = [method, "", contentType, date, `${canonicalizedOssHeaders}/${config.bucket}/${objectKey}`].join("\n");
  const signature = createHmac("sha1", credentials.accessKeySecret).update(stringToSign).digest("base64");
  requestHeaders.Authorization = `OSS ${credentials.accessKeyId}:${signature}`;

  return fetch(`https://${config.endpoint}${objectPath}`, {
    method,
    headers: requestHeaders,
    body,
    signal: AbortSignal.timeout(method === "PUT" ? 120_000 : 30_000),
  });
}

function readLocalPayload(filePath) {
  return {
    bytes: readFileSync(filePath),
    contentType: contentTypeForPath(filePath),
  };
}

async function downloadRemotePayload(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "VastWearGen Site Asset Migration/1.0",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ASSET_BYTES) throw new Error(`remote asset too large: ${contentLength} bytes`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = normalizeContentType(response.headers.get("content-type")) || contentTypeForPath(new URL(sourceUrl).pathname);
  return { bytes, contentType };
}

function rewriteSourceReferences(sourceRoots, results) {
  const replacements = results
    .filter((item) => item.status === "uploaded" || item.status === "skipped")
    .map((item) => [item.source, item.url]);
  let count = 0;
  const sourceFiles = sourceRoots.flatMap((sourceRoot) => walkFiles(sourceRoot))
    .filter((filePath) => TEXT_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .filter((filePath) => !isIgnoredSourceFile(filePath));

  for (const filePath of sourceFiles) {
    let text = readFileSync(filePath, "utf8");
    const original = text;
    for (const [source, url] of replacements) {
      if (!text.includes(source)) continue;
      const nextText = text.split(source).join(url);
      if (nextText !== text) {
        count += text.split(source).length - 1;
        text = nextText;
      }
    }
    if (text !== original) writeFileSync(filePath, text, "utf8");
  }
  return count;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildManifest(config, assets, results) {
  return {
    generatedAt: new Date().toISOString(),
    bucket: config.bucket,
    region: config.region,
    publicBaseUrl: config.publicBaseUrl,
    prefix: config.prefix,
    assets: (results.length ? results : assets).map((item) => ({
      kind: item.kind,
      source: item.source,
      objectKey: item.objectKey,
      url: item.url,
      status: item.status || "planned",
      bytes: item.bytes,
      contentType: item.contentType,
      error: item.error,
      sourceFiles: item.sourceFiles,
    })),
  };
}

function writeManifest(manifestPath, manifest) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function printSamples(assets) {
  for (const asset of assets.slice(0, 12)) {
    console.log(`${asset.kind}: ${asset.source} -> ${asset.objectKey}`);
  }
  if (assets.length > 12) console.log(`... ${assets.length - 12} more`);
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".next", "node_modules", "dist", "build", "out"].includes(entry.name)) return [];
      return walkFiles(path);
    }
    return entry.isFile() ? [path] : [];
  });
}

function buildRemoteObjectKey(prefix, sourceUrl) {
  const parsed = new URL(sourceUrl);
  const hash = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 10);
  const sourcePath = decodeURIComponent(parsed.pathname || "/asset");
  const extension = normalizeAssetExtension(extname(sourcePath)) || ".bin";
  const pathWithoutExtension = sourcePath.replace(/\.[^/.]+$/, "");
  const cleanPath = cleanObjectPath(`${parsed.hostname}${pathWithoutExtension}`);
  return `${prefix}/remote/${cleanPath}-${hash}${extension.replace(".", "") ? extension : ".bin"}`;
}

function contentTypeForPath(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".avif") return "image/avif";
  if (extension === ".gif") return "image/gif";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".webp") return "image/webp";
  if (extension === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function normalizeContentType(value) {
  const contentType = (value || "").split(";")[0].trim().toLowerCase();
  return contentType.startsWith("image/") ? contentType : "";
}

function normalizeAssetExtension(extension) {
  const value = extension.toLowerCase();
  if (value === ".jpeg") return ".jpg";
  return ASSET_EXTENSIONS.has(value) ? value : "";
}

function parseAccessFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`Access file not found: ${filePath}`);
  const text = readFileSync(filePath, "utf8");
  let accessKeyId = matchFirst(text, [
    /(?:AccessKey\s*ID|AccessKeyId|AccessKeyID|Access Key ID)\s*[:：=,\t ]+([A-Za-z0-9]+)/i,
    /\b(LTAI[A-Za-z0-9]+)\b/,
  ]);
  let accessKeySecret = matchFirst(text, [
    /(?:AccessKey\s*Secret|AccessKeySecret|AccessKey Secret|Access Key Secret)\s*[:：=,\t ]+([A-Za-z0-9/+_=.-]+)/i,
  ]);
  const securityToken = matchFirst(text, [
    /(?:SecurityToken|Security Token|STS Token|Token)\s*[:：=,\t ]+([A-Za-z0-9/+_=.-]+)/i,
  ]);

  if (!accessKeySecret && accessKeyId) {
    for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      if (!line.includes(accessKeyId)) continue;
      const parts = line.split(/[\t,]/).map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      const idIndex = parts.findIndex((part) => part === accessKeyId);
      if (idIndex >= 0 && parts[idIndex + 1]) {
        accessKeySecret = parts[idIndex + 1];
        break;
      }
    }
  }

  return { accessKeyId, accessKeySecret, securityToken };
}

function matchFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
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

function cleanObjectPath(value) {
  return value
    .split(/[\\/]+/)
    .map((part) => sanitizeSegment(part))
    .filter(Boolean)
    .join("/");
}

function sanitizeSegment(value) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function trimUrl(value) {
  return value.replace(/[.,;]+$/, "");
}

function isAlreadyInPrefix(sourceUrl, publicBaseUrl, prefix) {
  try {
    const source = new URL(sourceUrl);
    const base = new URL(publicBaseUrl);
    return source.hostname.toLowerCase() === base.hostname.toLowerCase()
      && decodeURIComponent(source.pathname).replace(/^\/+/, "").startsWith(`${prefix}/`);
  } catch {
    return false;
  }
}

function isIgnoredSourceFile(filePath) {
  const rel = toPosix(relative(root, filePath));
  return rel.includes("/__tests__/") || /(^|[./-])(test|spec)\.[A-Za-z0-9]+$/.test(rel);
}

function isPlaceholderRemoteUrl(sourceUrl) {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    return PLACEHOLDER_HOSTS.has(host) || host.endsWith(".example");
  } catch {
    return false;
  }
}

function encodeObjectKey(objectKey) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveFromRoot(value) {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\")) return value;
  return join(root, value);
}

function splitCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function displayPath(path) {
  return toPosix(relative(root, path)) || ".";
}

function printHelp() {
  console.log(`Usage:
  node scripts/upload-site-assets-to-oss.mjs --dry-run
  node scripts/upload-site-assets-to-oss.mjs --access-file <path>
  node scripts/upload-site-assets-to-oss.mjs --access-file <path> --rewrite

Options:
  --dry-run                 Plan uploads and write a manifest without uploading
  --access-file <path>      Read AccessKey ID/Secret from an exported file
  --local-only              Upload only public/ files
  --remote-only             Upload only remote image URLs referenced by source
  --rewrite                 Replace matched source references with OSS URLs after upload
  --force                   Upload even when object already exists
  --limit <n>               Process only the first n assets
  --concurrency <n>         Parallel uploads, default ${DEFAULT_CONCURRENCY}
  --prefix <prefix>         OSS object prefix, default ALIYUN_OSS_SITE_ASSET_PREFIX or ${DEFAULT_SITE_ASSET_PREFIX}
  --manifest <path>         Output manifest, default ${DEFAULT_MANIFEST}
  --source-roots <csv>      Source roots to scan for remote URLs, default ${DEFAULT_SOURCE_ROOTS.join(",")}
`);
}
