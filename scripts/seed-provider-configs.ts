import { createClient } from "@supabase/supabase-js";
import { encryptProviderSecret } from "../lib/api/model-provider-secrets";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const minimaxKey = process.env.MINIMAX_API_KEY ?? "";
const minimaxVideoKey = process.env.MINIMAX_VIDEO_API_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!minimaxKey.trim()) {
  throw new Error("MINIMAX_API_KEY is required");
}
if (!minimaxVideoKey.trim()) {
  throw new Error("MINIMAX_VIDEO_API_KEY is required for video.providers seeding");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function publishConfig(configKey: string, value: Record<string, unknown>) {
  await admin.from("admin_config_versions").update({ status: "archived" }).eq("config_key", configKey).eq("status", "published");
  const { data, error } = await admin.from("admin_config_versions").insert({
    config_key: configKey,
    value,
    status: "published",
    published_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  console.log("published", configKey, data?.id);
}

async function main() {
  await publishConfig("llm.providers", {
    models: {
      vision: {
        enabled: true,
        provider: "minimax",
        baseUrl: "https://api.minimaxi.com",
        apiKey: encryptProviderSecret(minimaxKey),
        upstreamModel: "MiniMax-M3",
        responseType: "openai-chat",
      },
      text: {
        enabled: true,
        provider: "minimax",
        baseUrl: "https://api.minimaxi.com",
        apiKey: encryptProviderSecret(minimaxKey),
        upstreamModel: "MiniMax-M3",
        responseType: "openai-chat",
      },
    },
    updatedFrom: "scripts.seed-provider-configs",
    updatedAt: new Date().toISOString(),
  });

  await publishConfig("video.providers", {
    models: {
      video: {
        enabled: true,
        provider: "minimax",
        baseUrl: "https://api.new.bi",
        apiKey: encryptProviderSecret(minimaxVideoKey),
        upstreamModel: "minimax-h3",
        responseType: "minimax-video",
      },
    },
    updatedFrom: "scripts.seed-provider-configs",
    updatedAt: new Date().toISOString(),
  });
}

void main();
