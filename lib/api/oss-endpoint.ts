/**
 * Aliyun OSS endpoint scheme for local deployments.
 *
 * Production talks to Aliyun over HTTPS with the official endpoint. A local
 * deployment points ALIYUN_OSS_ENDPOINT at the intranet object service
 * (services/oss-local), which must be reachable by LAN browsers over plain
 * HTTP: a self-signed certificate would be rejected for image subresources.
 * Set ALIYUN_OSS_ENDPOINT_SCHEME=http to switch the scheme; the default keeps
 * upstream HTTPS behaviour.
 */
export function ossEndpointScheme(): "http" | "https" {
  return (process.env.ALIYUN_OSS_ENDPOINT_SCHEME || "").trim().toLowerCase() === "http"
    ? "http"
    : "https";
}
