import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import {
  AI_TOOL_MATTING_COMPOSE_MAX_JSON_BYTES,
  parseAiToolMattingComposeRequest,
  type AiToolMattingComposeValidationIssue,
} from "@/lib/ai-tools/matting-compose";
import { requireApiUser } from "@/lib/api/auth";
import {
  AiToolMattingComposeError,
  composeAiToolMattingResult,
} from "@/lib/api/ai-tools/matting-compose.server";
import {
  AiToolInputOwnershipError,
  extractAiToolMattingComposeProofs,
  resolveOwnedMattingComposeRequest,
} from "@/lib/api/ai-tools/input-ownership.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPOSE_RATE_LIMIT = 12;
const COMPOSE_RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const { supabase, user, response: authResponse } = await requireApiUser();
  if (!user) return authResponse;

  const limit = await checkRateLimit(
    `ai-tool-matting-compose:${user.id}`,
    COMPOSE_RATE_LIMIT,
    COMPOSE_RATE_WINDOW_MS,
  );
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSeconds, {
      label: "AI 抠图蒙版合成",
      limit: COMPOSE_RATE_LIMIT,
      windowMs: COMPOSE_RATE_WINDOW_MS,
    });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    return validationError([{
      path: "$",
      code: "invalid_type",
      message: "请求必须使用 application/json",
    }], "AI_TOOL_MATTING_JSON_REQUIRED", 415);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > AI_TOOL_MATTING_COMPOSE_MAX_JSON_BYTES) {
    return validationError([{
      path: "$",
      code: "invalid_value",
      message: "请求体不能超过 16KB",
    }], "AI_TOOL_MATTING_REQUEST_TOO_LARGE", 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > AI_TOOL_MATTING_COMPOSE_MAX_JSON_BYTES) {
      return validationError([{
        path: "$",
        code: "invalid_value",
        message: "请求体不能超过 16KB",
      }], "AI_TOOL_MATTING_REQUEST_TOO_LARGE", 413);
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return validationError([{
      path: "$",
      code: "invalid_type",
      message: "请求体必须是有效 JSON",
    }], "AI_TOOL_MATTING_JSON_INVALID");
  }

  let extracted: ReturnType<typeof extractAiToolMattingComposeProofs>;
  try {
    extracted = extractAiToolMattingComposeProofs(body);
  } catch (error) {
    if (error instanceof AiToolInputOwnershipError) return ownershipError(error);
    return validationError([{
      path: "$",
      code: "invalid_value",
      message: "图片归属证明格式无效",
    }]);
  }
  const parsed = parseAiToolMattingComposeRequest(extracted.requestBody);
  if (!parsed.ok) return validationError(parsed.issues);

  try {
    const trustedRequest = await resolveOwnedMattingComposeRequest(parsed.data, extracted.proofs, {
      userId: user.id,
      supabase,
    });
    const composed = await composeAiToolMattingResult(trustedRequest, { userId: user.id });
    return NextResponse.json({
      ok: true,
      request_id: parsed.data.request_id,
      operation: "matting",
      ...composed,
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AiToolInputOwnershipError) return ownershipError(error);
    if (error instanceof AiToolMattingComposeError) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        code: error.code,
        request_id: parsed.data.request_id,
        operation: "matting",
        result_urls: [],
        outputs: [],
        retryable: error.retryable,
      }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("[ai-tools/matting/compose] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: "透明 PNG 合成失败",
      code: "AI_TOOL_MATTING_COMPOSE_FAILED",
      request_id: parsed.data.request_id,
      operation: "matting",
      result_urls: [],
      outputs: [],
      retryable: true,
    }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function ownershipError(error: AiToolInputOwnershipError) {
  return NextResponse.json({
    ok: false,
    error: error.message,
    code: error.code,
    result_urls: [],
    outputs: [],
    retryable: error.retryable,
  }, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validationError(
  issues: AiToolMattingComposeValidationIssue[],
  code = "AI_TOOL_MATTING_VALIDATION_FAILED",
  status = 400,
) {
  return NextResponse.json({
    ok: false,
    error: issues[0]?.message || "请求参数无效",
    code,
    details: { issues },
    result_urls: [],
    outputs: [],
    retryable: false,
  }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
