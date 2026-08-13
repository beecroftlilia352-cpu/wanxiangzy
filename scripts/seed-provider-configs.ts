import { createClient } from "@supabase/supabase-js";
import { encryptProviderSecret } from "../lib/api/model-provider-secrets";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const minimaxKey = process.env.MINIMAX_API_KEY ?? "";
const newBiKey = process.env.PLATO_API_KEY || process.env.YUNWU_NATIVE_API_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!minimaxKey.trim() || !newBiKey.trim()) {
  throw new Error("MINIMAX_API_KEY and a new.bi key are required");
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
  await publishConfig("model.providers", {
    models: {
      "gpt-image-2": {
        enabled: true,
        baseUrl: "https://api.new.bi/v1",
        apiKey: encryptProviderSecret(newBiKey),
        upstreamModel: "gpt-image-2",
        responseType: "openai-image",
      },
      "nano-banana-2": {
        enabled: true,
        baseUrl: "https://api.new.bi",
        apiKey: encryptProviderSecret(newBiKey),
        upstreamModel: "gemini-3.1-flash-image",
        responseType: "gemini-native",
      },
      "nano-banana-pro": {
        enabled: true,
        baseUrl: "https://api.new.bi",
        apiKey: encryptProviderSecret(newBiKey),
        upstreamModel: "gemini-3-pro-image",
        responseType: "gemini-native",
      },
    },
    updatedFrom: "scripts.seed-provider-configs",
    updatedAt: new Date().toISOString(),
  });

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
}

void main();
