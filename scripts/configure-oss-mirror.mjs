import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const mode = (process.env.ALIYUN_OSS_REMOTE_TRANSFER_MODE || "stream").trim().toLowerCase();
if (!process.argv.includes("--check")) fail("this command is a read-only gate; pass --check");
if (mode !== "stream" && mode !== "mirror") fail("ALIYUN_OSS_REMOTE_TRANSFER_MODE must be stream or mirror");

const bucket = required("ALIYUN_OSS_BUCKET");
const region = required("ALIYUN_OSS_REGION");
const accessKeyId = required("ALIYUN_OSS_ACCESS_KEY_ID");
const accessKeySecret = required("ALIYUN_OSS_ACCESS_KEY_SECRET");
const securityToken = process.env.ALIYUN_OSS_SECURITY_TOKEN?.trim() || "";
const endpoint = (process.env.ALIYUN_OSS_ENDPOINT || `${bucket}.${region}.aliyuncs.com`)
  .trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
if (endpoint !== `${bucket}.${region}.aliyuncs.com`) fail("ALIYUN_OSS_ENDPOINT must match bucket.region.aliyuncs.com");
if (!/^(?:hex:)?[a-f0-9]{64}$/i.test(required("ADMIN_SECRETS_ENCRYPTION_KEY"))) {
  fail("ADMIN_SECRETS_ENCRYPTION_KEY must be a 32-byte hex key");
}
if (required("ALIYUN_OSS_MIRROR_SIGNING_SECRET").length < 32) {
  fail("ALIYUN_OSS_MIRROR_SIGNING_SECRET must contain at least 32 characters");
}
const allowedHosts = required("ALIYUN_OSS_REMOTE_ALLOWED_HOSTS").split(",").map((value) => value.trim()).filter(Boolean);
if (!allowedHosts.length || allowedHosts.some((host) => host === "*" || host.includes(":") || host.includes("/"))) {
  fail("ALIYUN_OSS_REMOTE_ALLOWED_HOSTS must contain explicit provider hostnames");
}

await checkFfprobe();
const acl = await bucketRequest("GET", "acl");
const aclXml = await acl.text();
if (!acl.ok) fail(`OSS_ACL_CHECK_FAILED HTTP ${acl.status}`);
if (!/<Grant>private<\/Grant>/i.test(aclXml)) fail("generated media bucket ACL must be private");

if (mode === "mirror") {
  const website = await bucketRequest("GET", "website");
  const websiteXml = await website.text();
  if (!website.ok) fail(`OSS_WEBSITE_CHECK_FAILED HTTP ${website.status}`);
  const generatedPrefix = normalizePrefix(process.env.ALIYUN_OSS_GENERATED_PREFIX || "generated-results/original");
  const mirrorPrefix = normalizePrefix(process.env.ALIYUN_OSS_MIRROR_PREFIX || `${generatedPrefix}/mirror`);
  if (!websiteXml.includes(`<KeyPrefixEquals>${mirrorPrefix}/</KeyPrefixEquals>`)
      || !websiteXml.includes("<RedirectType>Mirror</RedirectType>")) {
    fail(`OSS Website mirror rule for ${mirrorPrefix}/ is missing`);
  }
  const resolverBase = required("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
  const health = await fetch(`${resolverBase}/api/oss-mirror-source/__health`, {
    method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15_000),
  }).catch(() => fail("OSS_RESOLVER_HEALTH_UNREACHABLE"));
  if (health.status !== 204) fail(`OSS mirror resolver health failed: HTTP ${health.status}`);
}

console.log(`[oss-mirror] check passed mode=${mode} bucket=${bucket} acl=private ffprobe=ready`);

async function bucketRequest(method, subresource) {
  const date = new Date().toUTCString();
  const canonicalHeaders = securityToken ? `x-oss-security-token:${securityToken}\n` : "";
  const signature = createHmac("sha1", accessKeySecret)
    .update([method, "", "", date, `${canonicalHeaders}/${bucket}/?${subresource}`].join("\n"))
    .digest("base64");
  return fetch(`https://${endpoint}/?${subresource}`, {
    method,
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
      ...(securityToken ? { "x-oss-security-token": securityToken } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

async function checkFfprobe() {
  try {
    await execFileAsync("ffprobe", ["-version"], { timeout: 10_000, maxBuffer: 256_000 });
  } catch {
    fail("ffprobe is required by the durable video validation worker");
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`missing ${name}`);
  return value;
}

function normalizePrefix(value) {
  const prefix = value.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.includes("..") || /[\\?#]/.test(prefix)) fail("invalid OSS mirror prefix");
  return prefix;
}

function fail(message) {
  throw new Error(`[oss-mirror] ${message}`);
}
