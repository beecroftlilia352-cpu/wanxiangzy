import fs from "fs/promises";
import path from "path";

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
  if (!src.startsWith("/")) return src;

  const cleanPath = src.split("?")[0].replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", cleanPath);
  const bytes = await fs.readFile(filePath);
  return `data:${getMimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
