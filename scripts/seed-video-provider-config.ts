import { createClient } from "@supabase/supabase-js";
import { encryptProviderSecret } from "../lib/api/model-provider-secrets";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.VIDEO_BASE_URL || process.env.MINIMAX_VIDEO_BASE_URL || "https://api.new.bi";

const sharedKey = process.env.VIDEO_API_KEY?.trim() ?? "";
const minimaxKey = (process.env.MINIMAX_VIDEO_API_KEY?.trim() || sharedKey);
const seedanceKey = (process.env.SEEDANCE_VIDEO_API_KEY?.trim() || sharedKey);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function buildProvider(enabled: boolean, apiKey: string) {
  return {
    enabled,
    baseUrl,
    apiKey: apiKey ? encryptProviderSecret(apiKey) : "",
    responseType: "newapi-video",
  };
}

async function main() {
  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", "video.providers")
    .eq("status", "published");

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: "video.providers",
      value: {
        models: {
          video: {
            providers: {
              minimax: buildProvider(Boolean(minimaxKey), minimaxKey),
              seedance: buildProvider(Boolean(seedanceKey), seedanceKey),
            },
          },
        },
        updatedFrom: "scripts.seed-video-provider-config",
        updatedAt: new Date().toISOString(),
      },
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log("published video.providers", data?.id, { minimax: Boolean(minimaxKey), seedance: Boolean(seedanceKey) });
}

void main();
