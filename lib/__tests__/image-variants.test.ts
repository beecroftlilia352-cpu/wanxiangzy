import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("image variants", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("adds OSS image processing to Aliyun image URLs", async () => {
    const { getImageVariantUrl } = await loadImageVariants();
    const url = getImageVariantUrl(
      "https://vasthk.oss-cn-hongkong.aliyuncs.com/generated-results/original/image.png",
      "thumb"
    );

    expect(url).toContain("x-oss-process=");
    expect(decodeURIComponent(url)).toContain("image/resize,m_lfit,w_320");
  });

  it("uses configured custom OSS image hosts", async () => {
    process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS = "vasthk.cn-hongkong.thepacificgls.com";
    const { getImageVariantUrl } = await loadImageVariants();

    const url = getImageVariantUrl("https://vasthk.cn-hongkong.thepacificgls.com/site-assets/original/banner.jpg", "card");

    expect(decodeURIComponent(url)).toContain("image/resize,m_lfit,w_640");
  });

  it("leaves non-OSS URLs unchanged", async () => {
    const { getImageVariantUrl } = await loadImageVariants();
    const url = "https://example.com/static/image.png";

    expect(getImageVariantUrl(url, "card")).toBe(url);
  });
});

async function loadImageVariants() {
  vi.resetModules();
  return import("@/lib/image-variants");
}
