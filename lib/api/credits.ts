import { randomUUID } from "node:crypto";
import { syncGenerationTaskQueueById } from "@/lib/task-queue-store";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeGenerationErrorMessage } from "@/lib/api/generation-errors";

type SupabaseLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export class CreditError extends Error {
  status: number;
  required?: number;
  balance?: number;

  constructor(message: string, status = 500, details?: { required?: number; balance?: number }) {
    super(message);
    this.name = "CreditError";
    this.status = status;
    this.required = details?.required;
    this.balance = details?.balance;
  }
}

export async function createDebitedGeneration(
  supabase: SupabaseLike,
  params: {
    userId: string;
    clothingUrls: string[];
    modelFaceUrl?: string | null;
    referenceUrl?: string | null;
    creditsCost: number;
    aiModel: string;
    imageSize: string;
    reason: string;
    jobPayload?: Record<string, unknown>;
    idempotencyKey?: string;
  }
): Promise<{ generationId: string; creditsRemaining: number }> {
  await assertUserCanGenerate(params.userId);
  const idempotencyKey = normalizeGenerationIdempotencyKey(params.idempotencyKey);

  const { data, error } = await supabase.rpc("create_generation_with_credit_debit_v2", {
    p_user_id: params.userId,
    p_clothing_urls: params.clothingUrls,
    p_model_face_url: params.modelFaceUrl ?? null,
    p_reference_url: params.referenceUrl ?? null,
    p_credits_cost: params.creditsCost,
    p_ai_model: params.aiModel,
    p_image_size: params.imageSize,
    p_reason: params.reason,
    p_job_payload: params.jobPayload ?? {},
    p_idempotency_key: idempotencyKey,
    p_max_active_jobs: readMaxActiveJobs(),
  });

  if (error) {
    throw normalizeCreditRpcError(error.message, params.creditsCost);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!isDebitedGenerationRow(row)) {
    throw new CreditError("灵点事务返回异常");
  }

  await syncGenerationQueueIndex(row.generation_id, "create");

  return {
    generationId: row.generation_id,
    creditsRemaining: row.credits_remaining,
  };
}

export async function failGenerationWithRefund(
  supabase: SupabaseLike,
  params: {
    userId: string;
    generationId: string;
    amount: number;
    deliveryVersion: number;
    executionToken: string;
    reason: string;
    errorMessage: string;
  }
) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.rpc("fail_generation_with_credit_refund", {
      p_user_id: params.userId,
      p_generation_id: params.generationId,
      p_amount: params.amount,
      p_delivery_version: params.deliveryVersion,
      p_execution_token: params.executionToken,
      p_reason: params.reason,
      p_error_message: params.errorMessage,
    });

    if (!error) {
      await syncGenerationQueueIndex(params.generationId, "fail");
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.error(`[credits] refund rpc failed (attempt ${attempt}/${maxRetries}):`, error.message);
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new CreditError(
    `退款结算失败：generation=${params.generationId}，已重试 ${maxRetries} 次`,
  );
}

export async function assertUserCanGenerate(userId: string) {
  try {
    const { data, error } = await getAdminClient()
      .from("admin_user_controls")
      .select("status,generate_enabled,reason,expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingUserControlTable(error)) return;
      throw new CreditError(error.message || "用户运营状态检查失败", 500);
    }

    if (!data) return;
    const expiresAt = typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return;

    const status = String(data.status || "active").toLowerCase();
    const generateEnabled = data.generate_enabled !== false;
    if (status === "suspended" || !generateEnabled) {
      const reason = typeof data.reason === "string" && data.reason.trim() ? `：${data.reason.trim()}` : "";
      throw new CreditError(`账号已被运营暂停生成${reason}`, 403);
    }
  } catch (error) {
    if (error instanceof CreditError) throw error;
    if (process.env.NODE_ENV === "development") {
      console.warn("[user-control] generation check skipped:", error);
    }
  }
}

function isMissingUserControlTable(error: { code?: string; message?: string }) {
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return (
    message.includes("42p01") ||
    message.includes("does not exist") ||
    (message.includes("could not find") && message.includes("admin_user_controls"))
  );
}

export async function completeGenerationWithCreditAdjustment(
  supabase: SupabaseLike,
  params: {
    userId: string;
    generationId: string;
    resultUrls: string[];
    deliveryVersion: number;
    executionToken: string;
    jobPayload: Record<string, unknown>;
    creditsUsed: number;
    refundAmount: number;
    refundReason: string;
    errorMessage?: string | null;
  }
): Promise<boolean> {
  const maxRetries = params.refundAmount > 0 ? 3 : 1;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.rpc("complete_generation_with_credit_adjustment", {
      p_user_id: params.userId,
      p_generation_id: params.generationId,
      p_result_urls: params.resultUrls,
      p_delivery_version: params.deliveryVersion,
      p_execution_token: params.executionToken,
      p_job_payload: params.jobPayload,
      p_credits_used: params.creditsUsed,
      p_refund_amount: params.refundAmount,
      p_refund_reason: params.refundReason,
      p_error_message: params.errorMessage ?? null,
    });

    if (!error) {
      await syncGenerationQueueIndex(params.generationId, "complete");
      return true;
    }

    const message = error.message || "";
    if (process.env.NODE_ENV === "development") {
      console.error(`[credits] completion adjustment rpc failed (attempt ${attempt}/${maxRetries}):`, message);
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new CreditError(
    `完成结算失败：generation=${params.generationId}，refund=${params.refundAmount}`,
  );
}

export function errorToResponsePayload(err: unknown) {
  if (err instanceof CreditError && err.status < 500) {
    return {
      status: err.status,
      body: {
        error: err.message,
        required: err.required,
        balance: err.balance,
      },
    };
  }

  const errorId = randomUUID();
  console.error(`[generation-api] ${errorId}: ${sanitizeGenerationErrorMessage(err, "internal error")}`);
  return {
    status: err instanceof CreditError && err.status === 503 ? 503 : 500,
    body: { error: "生成服务暂时不可用，请稍后重试", error_id: errorId },
  };
}

function normalizeCreditRpcError(message = "", required: number) {
  const insufficient = message.match(/INSUFFICIENT_CREDITS:(\d+)/);
  if (insufficient) {
    const balance = Number(insufficient[1]);
    return new CreditError(`灵点不足。需要 ${required}，余额 ${balance}`, 402, {
      required,
      balance,
    });
  }

  if (
    message.includes("create_generation_with_credit_debit_v2") ||
    message.includes("Could not find the function")
  ) {
    return new CreditError("数据库缺少 BullMQ 事务 Outbox，请先应用生产队列迁移");
  }

  if (message.includes("IDEMPOTENCY_CONFLICT")) {
    return new CreditError("幂等键已用于不同的生成请求，请创建新的任务", 409);
  }
  if (message.includes("ACTIVE_JOB_LIMIT_EXCEEDED")) {
    return new CreditError("当前进行中的任务已达到套餐上限，请等待部分任务完成后重试", 429);
  }
  if (message.includes("INVALID_IDEMPOTENCY_KEY")) {
    return new CreditError("生成请求幂等键无效", 400);
  }
  if (message.includes("NOT_ALLOWED")) {
    return new CreditError("登录状态校验失败，请刷新页面后重新登录", 401);
  }

  return new CreditError("生成请求事务暂时不可用", 503);
}

export function requireGenerationIdempotencyKey(request: Pick<Request, "headers">): string {
  return normalizeGenerationIdempotencyKey(request.headers.get("idempotency-key") || "");
}

function normalizeGenerationIdempotencyKey(value: string | undefined) {
  const normalized = (value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{19,159}$/.test(normalized)) {
    throw new CreditError("缺少或无效的 Idempotency-Key（20-160 位）", 400);
  }
  return normalized;
}

function readMaxActiveJobs() {
  const raw = process.env.GENERATION_MAX_ACTIVE_PER_USER;
  if (!raw) return 20;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000) {
    throw new CreditError("GENERATION_MAX_ACTIVE_PER_USER 必须是 1-1000 的整数", 500);
  }
  return parsed;
}

function isDebitedGenerationRow(
  value: unknown
): value is { generation_id: string; credits_remaining: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { generation_id?: unknown }).generation_id === "string" &&
    typeof (value as { credits_remaining?: unknown }).credits_remaining === "number"
  );
}

async function syncGenerationQueueIndex(generationId: string, phase: string) {
  try {
    await syncGenerationTaskQueueById(generationId);
  } catch (error) {
    console.warn(`[task-queue-index] generation ${phase} sync skipped: ${sanitizeGenerationErrorMessage(error)}`);
  }
}
