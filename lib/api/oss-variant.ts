import { createHmac } from "node:crypto";
import { getAliyunOssConfig } from "@/lib/api/image-storage";

/**
 * x-oss-process pipeline strings for the /api/oss-image redirect route.
 * Mirror the variants exposed by lib/image-variants.ts so SSR <img> can
 * request a 320w/640w/1280w/2560w WebP via a server-signed OSS URL.
 */
export const OSS_VARIANT_PIPELINES: Record<string, string> = {
  thumb: "image/resize,m_lfit,w_320/format,webp/quality,q_82",
  card: "image/resize,m_lfit,w_640/format,webp/quality,q_84",
  preview: "image/resize,m_lfit,w_1280/format,webp/quality,q_86",
  detail: "image/resize,m_lfit,w_2560/format,webp/quality,q_94",
};

const SIGNED_URL_TTL_SECONDS = 300;

function decodeObjectKey(rawPath: string): string {
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // keep raw
  }
  return path.replace(/^\/+/, "");
}

function getOssConfigOrThrow() {
  const config = getAliyunOssConfig();
  if (!config.accessKeyId || !config.accessKeySecret) {
    throw new Error("OSS access key not configured");
  }
  return config;
}

function splitBucketAndKey(srcUrl: URL, config: ReturnType<typeof getAliyunOssConfig>): { bucket: string; objectKey: string; host: string } {
  const host = srcUrl.hostname;
  const configuredHosts = new Set<string>();
  try {
    configuredHosts.add(new URL(config.publicBaseUrl).hostname.toLowerCase());
  } catch {
    // getAliyunOssConfig already validates the public base URL.
  }
  for (const value of (process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS || "").split(",")) {
    const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (normalized) configuredHosts.add(normalized);
  }
  // CNAME/CDN hosts do not encode the bucket in their hostname. They are
  // explicitly configured, so resolve their path against the known bucket.
  const publicHost = configuredHosts.has(host.toLowerCase());
  const standardHost = host === `${config.bucket}.${config.region}.aliyuncs.com` || host.endsWith(".aliyuncs.com");
  if (publicHost && !standardHost) {
    let objectPath = srcUrl.pathname;
    try {
      const basePath = new URL(config.publicBaseUrl).pathname.replace(/\/+$/, "");
      if (basePath && objectPath.startsWith(`${basePath}/`)) objectPath = objectPath.slice(basePath.length);
    } catch {
      // keep the source path
    }
    return { bucket: config.bucket, objectKey: decodeObjectKey(objectPath), host };
  }
  // Virtual-hosted style: <bucket>.<region>.aliyuncs.com
  // or <bucket>.<service>.<region>.aliyuncs.com
  const labels = host.split(".");
  if (labels.length >= 4) {
    const bucket = labels[0];
    const objectKey = decodeObjectKey(srcUrl.pathname);
    return { bucket, objectKey, host };
  }
  // Path-style: <endpoint>/<bucket>/<key>
  const segments = srcUrl.pathname.replace(/^\/+/, "").split("/");
  const bucket = segments.shift() ?? "";
  const objectKey = segments.join("/");
  return { bucket, objectKey, host };
}

function buildPublicHost(config: ReturnType<typeof getAliyunOssConfig>): string {
  const publicBase = config.publicBaseUrl?.trim();
  if (publicBase) {
    try {
      return new URL(publicBase).host;
    } catch {
      // fall through
    }
  }
  // Default to virtual-hosted style for the configured bucket
  return `${config.bucket}.${config.region}.aliyuncs.com`;
}

/**
 * Build a server-signed OSS GET URL with `x-oss-process` baked in.
 * Only the requested `variant` pipeline is appended; the URL is otherwise
 * identical to a direct GET, so the browser will fetch the processed
 * WebP as a normal image response.
 */
export function createSignedOssVariantUrl(srcUrl: URL, variant: keyof typeof OSS_VARIANT_PIPELINES): string {
  const config = getOssConfigOrThrow();
  const { bucket, objectKey, host } = splitBucketAndKey(srcUrl, config);
  if (!bucket || !objectKey) {
    throw new Error("cannot derive bucket or key from src");
  }
  if (bucket !== config.bucket) {
    // We only sign for the configured showcase bucket. Other buckets are
    // rejected so we never leak signed URLs for unrelated content.
    throw new Error(`bucket ${bucket} is not the configured showcase bucket`);
  }
  const pipeline = OSS_VARIANT_PIPELINES[variant];
  if (!pipeline) {
    throw new Error(`unknown variant: ${String(variant)}`);
  }

  const publicHost = buildPublicHost(config);
  const expires = String(Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS);

  // Sort query params alphabetically before signing (OSS requirement)
  const queryParams: Array<[string, string]> = [
    ["x-oss-process", pipeline],
  ];
  if (config.securityToken) queryParams.push(["security-token", config.securityToken]);
  queryParams.sort(([a], [b]) => a.localeCompare(b));

  const canonicalQuery = queryParams.map(([k, v]) => `${k}=${v}`).join("&");
  // Aliyun OSS always uses path-style canonical resource regardless of
  // whether the URL is virtual-hosted or path-style.
  const canonicalResource = `/${bucket}/${objectKey}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const stringToSign = ["GET", "", "", expires, canonicalResource].join("\n");
  const signature = createHmac("sha1", config.accessKeySecret)
    .update(stringToSign)
    .digest("base64");

  const publicScheme = (() => {
    try {
      return new URL(config.publicBaseUrl).protocol === "http:" ? "http" : "https";
    } catch {
      return "https";
    }
  })();
  const finalUrl = new URL(`${publicScheme}://${publicHost}/${objectKey}`);
  finalUrl.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  finalUrl.searchParams.set("Expires", expires);
  for (const [k, v] of queryParams) finalUrl.searchParams.set(k, v);
  finalUrl.searchParams.set("Signature", signature);
  return finalUrl.toString();
}
