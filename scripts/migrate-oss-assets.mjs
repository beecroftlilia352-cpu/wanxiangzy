import { createHash, createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const OLD_DOMAIN = process.env.OLD_OSS_DOMAIN || "vastweargen-images.oss-cn-hongkong.aliyuncs.com";
const OLD_BASE = `https://${OLD_DOMAIN}`;

const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
const region = process.env.ALIYUN_OSS_REGION?.trim();
const endpoint = `${bucket}.${region}.aliyuncs.com`;

const CONCURRENCY = Number(process.env.MIGRATE_CONCURRENCY || 6);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".html"]);

if (!accessKeyId || !accessKeySecret || !bucket || !region) {
  console.error("Missing ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_BUCKET / ALIYUN_OSS_REGION");
  process.exit(1);
}

const CONTENT_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", mp4: "video/mp4", mov: "video/quicktime",
  webm: "video/webm", m4v: "video/x-m4v", json: "application/json", css: "text/css",
  js: "application/javascript", mjs: "application/javascript", html: "text/html",
  txt: "text/plain", ico: "image/x-icon", avif: "image/avif",
};

function contentTypeFor(key) {
  const ext = path.extname(key).slice(1).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function sign(method, contentType, date, resource) {
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${resource}`;
  return createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git" || entry.name === ".claude") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

function extractOldUrls(text) {
  const out = new Set();
  const re = /https:\/\/[^"'\\\s()<>]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let url = m[0].replace(/[.,;]+$/, "");
    if (url.startsWith(`${OLD_BASE}/`)) out.add(url);
  }
  return out;
}

async function scanRepo() {
  const urls = new Set();
  for await (const file of walk(".")) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const url of extractOldUrls(text)) urls.add(url);
  }
  return [...urls].sort();
}

async function headNew(key) {
  const date = new Date().toUTCString();
  const resource = `/${bucket}/${key}`;
  const sig = sign("HEAD", "", date, resource);
  const res = await fetch(`https://${endpoint}/${encodeURI(key)}`, {
    method: "HEAD",
    headers: { Authorization: `OSS ${accessKeyId}:${sig}`, Date: date },
  });
  return res.ok;
}

async function putNew(key, bytes, contentType) {
  const date = new Date().toUTCString();
  const resource = `/${bucket}/${key}`;
  const sig = sign("PUT", contentType, date, resource);
  const res = await fetch(`https://${endpoint}/${encodeURI(key)}`, {
    method: "PUT",
    headers: { Authorization: `OSS ${accessKeyId}:${sig}`, Date: date, "Content-Type": contentType },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`PUT ${key} -> ${res.status} ${await res.text().catch(() => "")}`);
  }
}

async function migrateOne(url, skipExisting) {
  const key = url.slice(`${OLD_BASE}/`.length);
  if (!key) return { key, status: "skip-empty" };
  if (skipExisting && (await headNew(key))) return { key, status: "exists" };

  const get = await fetch(url);
  if (!get.ok) return { key, status: `old-get-${get.status}` };
  const bytes = Buffer.from(await get.arrayBuffer());

  await putNew(key, bytes, contentTypeFor(key));
  return { key, status: "ok", bytes: bytes.length };
}

async function main() {
  const skipExisting = process.env.MIGRATE_SKIP_EXISTING === "1";
  const urls = await scanRepo();
  console.log(`Found ${urls.length} unique old-bucket URLs`);

  const results = { ok: 0, exists: 0, skip_empty: 0, failed: [] };
  const queue = [...urls];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const r = await migrateOne(url, skipExisting);
        if (r.status === "ok") results.ok += 1;
        else if (r.status === "exists") results.exists += 1;
        else if (r.status === "skip-empty") results.skip_empty += 1;
        else {
          results.failed.push({ url, status: r.status });
          console.error(`FAIL ${r.status} ${url}`);
        }
        if (r.status === "ok") process.stdout.write(`.`);
      } catch (err) {
        results.failed.push({ url, error: String(err.message || err) });
        console.error(`\nFAIL ${url} ${err.message || err}`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`\n\nDone. ok=${results.ok} exists=${results.exists} skip_empty=${results.skip_empty} failed=${results.failed.length}`);
  if (results.failed.length) {
    console.log("Failed items:");
    for (const f of results.failed) console.log(" -", f);
    process.exit(1);
  }
}

void main();
