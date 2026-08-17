import { NextResponse } from "next/server";
import { getStudioShowcaseRegistry } from "@/lib/showcase-examples.server";
import { normalizeShowcaseModule } from "@/lib/showcase-examples";

export async function GET(request: Request) {
  const module = normalizeShowcaseModule(new URL(request.url).searchParams.get("module"));
  const registry = await getStudioShowcaseRegistry(module);
  return NextResponse.json(
    {
      module: registry.module,
      enabled: registry.enabled,
      items: registry.enabled ? registry.items.filter((item) => item.enabled) : [],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
