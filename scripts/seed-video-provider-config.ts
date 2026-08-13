import { createClient } from "@supabase/supabase-js";
import { encryptProviderSecret } from "../lib/api/model-provider-secrets";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const minimaxVideoKey = process.env.MINIMAX_VIDEO_API_KEY ?? "";
const baseUrl = process.env.MINIMAX_VIDEO_BASE_URL || "https://api.new.bi";
const model = process.env.MINIMAX_VIDEO_MODEL || "minimax-h3";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!minimaxVideoKey.trim()) {
  throw new Error("MINIMAX_VIDEO_API_KEY is required");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const encrypted = encryptProviderSecret(minimaxVideoKey.trim());
  await admin.from("admin_config_versions").update({ status: "archived" }).eq("config_key", "video.providers").eq("status", "published");
  const { data, error } = await admin.from("admin_config_versions").insert({
    config_key: "video.providers",
    value: {
      models: {
        video: {
          enabled: true,
          provider: "minimax",
          baseUrl,
          apiKey: encrypted,
          upstreamModel: model,
          responseType: "minimax-video",
        },
      },
      updatedFrom: "scripts.seed-video-provider-config",
      updatedAt: new Date().toISOString(),
    },
    status: "published",
    published_at: new Date().toISOString(),
  }).select("id").single();

  if (error) throw error;
  console.log("published video.providers", data?.id);
}

void main();
