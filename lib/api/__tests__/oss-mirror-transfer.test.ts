import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAliyunOssRemoteTransferMode,
  parseGenerationIdFromResultRef,
} from "@/lib/api/oss-mirror-transfer";

describe("OSS generated-result transfer contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reliably extracts the generation UUID from every result suffix shape", () => {
    const id = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
    expect(parseGenerationIdFromResultRef(id)).toBe(id);
    expect(parseGenerationIdFromResultRef(`${id}-1`)).toBe(id);
    expect(parseGenerationIdFromResultRef(`${id}-product-module-2`)).toBe(id);
    expect(parseGenerationIdFromResultRef(`prefix-${id}`)).toBeNull();
    expect(parseGenerationIdFromResultRef("gen-1")).toBeNull();
  });

  it("fails closed on disabled production storage and defaults production to stream", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IMAGE_STORAGE_PROVIDER", "aliyun-oss");
    delete process.env.ALIYUN_OSS_REMOTE_TRANSFER_MODE;
    expect(getAliyunOssRemoteTransferMode()).toBe("stream");
    vi.stubEnv("ALIYUN_OSS_REMOTE_TRANSFER_MODE", "disabled");
    expect(() => getAliyunOssRemoteTransferMode()).toThrow("ALIYUN_OSS_REMOTE_TRANSFER_MODE=stream|mirror");
  });
});
