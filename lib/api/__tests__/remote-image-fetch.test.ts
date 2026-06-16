import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRemoteImageBuffer,
  isPrivateOrReservedIpAddress,
  type RemoteImageFetchOptions,
} from "../remote-image-fetch";

const publicLookup: NonNullable<RemoteImageFetchOptions["lookupHost"]> = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("remote image fetch", () => {
  const originalAllowedHosts = process.env.IMAGE_STORAGE_REMOTE_ALLOWED_HOSTS;
  const originalRemoteAllowedHosts = process.env.REMOTE_IMAGE_ALLOWED_HOSTS;

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv("IMAGE_STORAGE_REMOTE_ALLOWED_HOSTS", originalAllowedHosts);
    restoreEnv("REMOTE_IMAGE_ALLOWED_HOSTS", originalRemoteAllowedHosts);
  });

  it("classifies private and reserved IP addresses", () => {
    expect(isPrivateOrReservedIpAddress("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIpAddress("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("169.254.10.20")).toBe(true);
    expect(isPrivateOrReservedIpAddress("192.168.1.20")).toBe(true);
    expect(isPrivateOrReservedIpAddress("::1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fc00::1")).toBe(true);
  });

  it("blocks direct private IP URLs before fetching", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchRemoteImageBuffer("https://127.0.0.1/private.png", { fetchImpl })
    ).rejects.toMatchObject({ code: "blocked-address" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks hosts that resolve to private addresses", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchRemoteImageBuffer("https://internal.example/image.png", {
        fetchImpl,
        lookupHost: async () => [{ address: "10.0.0.12", family: 4 }],
      })
    ).rejects.toMatchObject({ code: "blocked-address" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates redirect targets before following them", async () => {
    const fetchImpl = vi.fn(async () => (
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private.png" },
      })
    ));

    await expect(
      fetchRemoteImageBuffer("https://cdn.example.com/image.png", {
        fetchImpl,
        lookupHost: publicLookup,
      })
    ).rejects.toMatchObject({ code: "blocked-address" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honors configured host allowlists", async () => {
    process.env.IMAGE_STORAGE_REMOTE_ALLOWED_HOSTS = "assets.example.com,*.trusted.example";
    const fetchImpl = vi.fn();

    await expect(
      fetchRemoteImageBuffer("https://untrusted.example/image.png", {
        fetchImpl,
        lookupHost: publicLookup,
      })
    ).rejects.toMatchObject({ code: "blocked-host" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-image content types", async () => {
    const fetchImpl = vi.fn(async () => (
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      })
    ));

    await expect(
      fetchRemoteImageBuffer("https://assets.example.com/page", {
        fetchImpl,
        lookupHost: publicLookup,
      })
    ).rejects.toMatchObject({ code: "non-image" });
  });

  it("rejects oversized content-length headers", async () => {
    const fetchImpl = vi.fn(async () => (
      new Response(new Uint8Array([1]), {
        headers: {
          "content-length": "5",
          "content-type": "image/png",
        },
      })
    ));

    await expect(
      fetchRemoteImageBuffer("https://assets.example.com/image.png", {
        fetchImpl,
        lookupHost: publicLookup,
        maxBytes: 4,
      })
    ).rejects.toMatchObject({ code: "too-large" });
  });

  it("rejects bodies that exceed the actual read limit", async () => {
    const fetchImpl = vi.fn(async () => (
      new Response(new Uint8Array([1, 2, 3, 4, 5]), {
        headers: { "content-type": "image/png" },
      })
    ));

    await expect(
      fetchRemoteImageBuffer("https://assets.example.com/image.png", {
        fetchImpl,
        lookupHost: publicLookup,
        maxBytes: 4,
      })
    ).rejects.toMatchObject({ code: "too-large" });
  });

  it("returns image bytes for public allowed images", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchImpl = vi.fn(async () => (
      new Response(pngBytes, {
        headers: { "content-type": "image/png" },
      })
    ));

    const result = await fetchRemoteImageBuffer("https://assets.example.com/image.png", {
      fetchImpl,
      lookupHost: publicLookup,
    });

    expect(result.contentType).toBe("image/png");
    expect(result.bytes).toEqual(Buffer.from(pngBytes));
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
