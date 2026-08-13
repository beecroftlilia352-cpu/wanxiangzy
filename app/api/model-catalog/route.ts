import { NextResponse } from "next/server";
import { getPublishedModelProviderRawValue } from "@/lib/api/model-provider-registry.server";

const IMAGE_MODELS = ["nano-banana-2", "gpt-image-2", "nano-banana-pro"] as const;

export async function GET() {
  const raw = await getPublishedModelProviderRawValue();
  const container = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const models = raw && typeof raw.models === "object" && !Array.isArray(raw.models) ? raw.models as Record<string, unknown> : {};

  const visible = IMAGE_MODELS.filter((model) => {
    const entry = models[model];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return (entry as Record<string, unknown>).enabled !== false;
    }
    return true;
  });

  return NextResponse.json(
    { ok: true, models: visible },
    { headers: { "Cache-Control": "no-store" } },
  );
}
