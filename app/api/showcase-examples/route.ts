import { NextResponse } from "next/server";
import { getStudioShowcaseRegistry } from "@/lib/showcase-examples.server";

export async function GET() {
  const registry = await getStudioShowcaseRegistry();
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
