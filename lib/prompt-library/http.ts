import { NextResponse } from "next/server";
import { PromptLibraryError } from "@/lib/prompt-library/server";

export function promptLibraryErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof PromptLibraryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[prompt-library] unexpected error:", error);
  return NextResponse.json(
    { error: fallbackMessage, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
