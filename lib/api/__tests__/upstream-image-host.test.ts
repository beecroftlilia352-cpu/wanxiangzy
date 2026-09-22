import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isStableStoredImageUrl, isUpstreamImageHost } from "@/lib/api/image-storage";

/**
 * Verifies the UPSTREAM_IMAGE_HOSTS switch added by the local-deployment patch.
 *
 * Upstream production refuses to persist a vendor URL as a result and mirrors
 * every output into the object store. This deployment lets the operator name the
 * vendor's own image hosts, in which case a result keeps the vendor URL.
 * Empty allowlist must behave exactly like upstream.
 */
describe("UPSTREAM_IMAGE_HOSTS", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.UPSTREAM_IMAGE_HOSTS;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...original };
  });

  it("an empty allowlist keeps the upstream behaviour in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isUpstreamImageHost("https://img.vendor.example/a.png")).toBe(false);
    // raw vendor URLs stay "unstable" -> the pipeline mirrors them
    expect(isStableStoredImageUrl("https://img.vendor.example/a.png")).toBe(false);
    // canonical registry capabilities are still accepted
    expect(
      isStableStoredImageUrl("/api/media-assets/6bc296ae-f452-4a90-83a1-20ff7ea2d30f"),
    ).toBe(true);
  });

  it("accepts an allowlisted vendor host even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.UPSTREAM_IMAGE_HOSTS = "img.vendor.example, cdn.second.example";
    expect(isUpstreamImageHost("https://img.vendor.example/a.png")).toBe(true);
    expect(isUpstreamImageHost("https://cdn.second.example/b.png")).toBe(true);
    expect(isUpstreamImageHost("https://IMG.VENDOR.EXAMPLE/a.png")).toBe(true);
    expect(isStableStoredImageUrl("https://img.vendor.example/a.png")).toBe(true);
  });

  it("refuses other hosts, credentials in the URL, and non-http protocols", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.UPSTREAM_IMAGE_HOSTS = "img.vendor.example";
    expect(isUpstreamImageHost("https://evil.example/a.png")).toBe(false);
    expect(isUpstreamImageHost("https://img.vendor.example.evil.example/a.png")).toBe(false);
    expect(isUpstreamImageHost("https://user:pw@img.vendor.example/a.png")).toBe(false);
    expect(isUpstreamImageHost("file:///etc/passwd")).toBe(false);
    expect(isUpstreamImageHost("data:image/png;base64,AAAA")).toBe(false);
    expect(isUpstreamImageHost("not a url")).toBe(false);
  });
});
