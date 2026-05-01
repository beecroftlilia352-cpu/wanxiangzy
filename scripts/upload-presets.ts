/**
 * 上传预设图片到 Supabase Storage
 * 运行: npx tsx scripts/upload-presets.ts
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 加载 .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const MODELS_DIR = path.resolve(__dirname, "../public/models");
const REFERENCES_DIR = path.resolve(__dirname, "../public/references");

async function uploadFile(
  bucket: string,
  filePath: string,
  fileName: string
): Promise<string | null> {
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const contentType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error(`  FAIL ${bucket}/${fileName}: ${error.message}`);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  console.log(`  OK   ${data.publicUrl}`);
  return data.publicUrl;
}

async function main() {
  console.log("=== Uploading preset models ===");
  const modelFiles = fs.readdirSync(MODELS_DIR).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  for (const file of modelFiles) {
    await uploadFile("models", path.join(MODELS_DIR, file), file);
  }

  console.log("\n=== Uploading preset references ===");
  const refFiles = fs.readdirSync(REFERENCES_DIR).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  for (const file of refFiles) {
    await uploadFile("references", path.join(REFERENCES_DIR, file), file);
  }

  console.log("\nDone! Update PRESET_MODELS and PRESET_REFERENCES URLs in:");
  console.log("  - app/create/page.tsx");
  console.log("  - app/model/page.tsx (if applicable)");
}

main().catch(console.error);
