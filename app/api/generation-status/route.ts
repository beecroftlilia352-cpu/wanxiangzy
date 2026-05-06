import { NextRequest } from "next/server";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
