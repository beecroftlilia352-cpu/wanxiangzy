import fs from "fs/promises";
import path from "path";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const MAX_LOCAL_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 18 * 1024 * 1024;

export async function resolveImageInputs(input: {
  clothingUrls: string[];
  referenceUrl?: string;
  modelFaceUrl?: string;
}): Promise<{
  clothingUrls: string[];
  referenceUrl?: string;
  modelFaceUrl?: string;
}> {
  const [clothingUrls, referenceUrl, modelFaceUrl] = await Promise.all([
    Promise.all(input.clothingUrls.map(resolveImageInput)),
    input.referenceUrl ? resolveImageInput(input.referenceUrl) : undefined,
    input.modelFaceUrl ? resolveImageInput(input.modelFaceUrl) : undefined,
  ]);

  return { clothingUrls, referenceUrl, modelFaceUrl };
}

async function resolveImageInput(src: string): Promise<string> {
  if (typeof src !== "string" || !src.trim()) {
    throw new Error("图片输入无效");
  }

  if (src.startsWith("data:")) {
    if (src.length > MAX_DATA_URL_LENGTH) {
      throw new Error("图片数据过大");
    }
    return src;
  }

  if (!src.startsWith("/")) return src;

  const cleanPath = getSafePublicPath(src);
  const filePath = path.resolve(PUBLIC_DIR, cleanPath);
  assertInsidePublicDir(filePath);

  if (!isSupportedImagePath(filePath)) {
    throw new Error("不支持的本地图片类型");
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("图片路径不是文件");
  }
  if (stat.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error("本地预设图片过大");
  }

  const bytes = await fs.readFile(filePath);
  return `data:${getMimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function getSafePublicPath(src: string): string {
  const rawPath = src.split("?")[0].replace(/^\/+/, "");
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error("图片路径编码无效");
  }

  if (
    !decodedPath ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.split(/[\\/]/).includes("..") ||
    path.isAbsolute(decodedPath)
  ) {
    throw new Error("图片路径不允许访问 public 目录外的文件");
  }

  return decodedPath;
}

function assertInsidePublicDir(filePath: string) {
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("图片路径不允许访问 public 目录外的文件");
  }
}

function isSupportedImagePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}

function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
