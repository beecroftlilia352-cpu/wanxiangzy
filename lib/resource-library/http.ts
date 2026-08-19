import { NextResponse } from "next/server";
import { ResourceLibraryError } from "@/lib/resource-library/server";

export function resourceLibraryErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ResourceLibraryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[resource-library] unexpected error:", error);
  return NextResponse.json(
    { error: fallbackMessage, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
