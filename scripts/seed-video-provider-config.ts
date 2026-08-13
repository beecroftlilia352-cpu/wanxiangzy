import { createClient } from "@supabase/supabase-js";
import { encryptProviderSecret } from "../lib/api/model-provider-secrets";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const provider = process.env.VIDEO_PROVIDER === "seedance" ? "seedance" : "minimax";
const videoKey = (provider === "seedance" ? process.env.SEEDANCE_VIDEO_API_KEY : process.env.MINIMAX_VIDEO_API_KEY) ?? "";
const baseUrl = process.env.VIDEO_BASE_URL || process.env.MINIMAX_VIDEO_BASE_URL || "https://api.new.bi";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!videoKey.trim()) {
  throw new Error(`${provider === "seedance" ? "SEEDANCE_VIDEO_API_KEY" : "MINIMAX_VIDEO_API_KEY"} is required`);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const encrypted = encryptProviderSecret(videoKey.trim());
  await admin.from("admin_config_versions").update({ status: "archived" }).eq("config_key", "video.providers").eq("status", "published");
  const { data, error } = await admin.from("admin_config_versions").insert({
    config_key: "video.providers",
    value: {
      models: {
        video: {
          enabled: true,
          provider,
          baseUrl,
          apiKey: encrypted,
          responseType: "newapi-video",
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
