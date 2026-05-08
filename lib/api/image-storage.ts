const IMGBB_API_URL = "https://api.imgbb.com/1/upload";
const DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS = 45_000;

export type ImageStorageProvider = "imgbb";

export interface StoredImage {
  url: string;
  display_url: string;
  delete_url: string;
  width: number;
  height: number;
}

export interface StoreImageInput {
  image: string;
  name: string;
  namePrefix?: string;
}

export interface StoreImageOptions {
  suppressErrorLog?: boolean;
  timeoutMs?: number;
}

export interface ImageStorageAdapter {
  provider: ImageStorageProvider;
  isStableUrl(url: string): boolean;
  storeImage(input: StoreImageInput, options?: StoreImageOptions): Promise<StoredImage>;
}

export function getImageStorageAdapter(): ImageStorageAdapter {
  return imgbbStorageAdapter;
}

export function getBase64Payload(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export function isStableStoredImageUrl(url: string) {
  return getImageStorageAdapter().isStableUrl(url);
}

export async function storeImage(
  input: StoreImageInput,
  options?: StoreImageOptions
) {
  return getImageStorageAdapter().storeImage(input, options);
}

const imgbbStorageAdapter: ImageStorageAdapter = {
  provider: "imgbb",

  isStableUrl(url: string) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "i.ibb.co" || host.endsWith(".ibb.co");
    } catch {
      return false;
    }
  },

  async storeImage(input: StoreImageInput, options: StoreImageOptions = {}) {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      throw new Error("图床上传服务未配置 IMGBB_API_KEY");
    }

    const form = new FormData();
    form.append("key", apiKey);
    form.append("image", input.image);
    form.append("name", `${input.namePrefix || ""}${input.name}`);

    const response = await fetch(IMGBB_API_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS),
    });

    const responseText = await response.text();
    if (!response.ok) {
      if (!options.suppressErrorLog) {
        console.error("[image-storage] imgbb upload error:", response.status, responseText.slice(0, 500));
      }
      throw new Error(`生成结果图片转存图床失败: ${response.status}`);
    }

    const data = JSON.parse(responseText);
    if (!data.success || !data.data?.url) {
      if (!options.suppressErrorLog) {
        console.error("[image-storage] imgbb upload failed:", responseText.slice(0, 500));
      }
      throw new Error("生成结果图片转存图床失败");
    }

    return {
      url: data.data.url,
      display_url: data.data.display_url || data.data.url,
      delete_url: data.data.delete_url || "",
      width: Number(data.data.width || 0),
      height: Number(data.data.height || 0),
    };
  },
};
