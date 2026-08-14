import { toast } from "sonner";
import { setCachedProfileCredits } from "@/lib/supabase/client";

export const CREDIT_UNIT_NAME = "灵点";
export const CREDIT_BALANCE_LABEL = `可用${CREDIT_UNIT_NAME}`;

export function creditAmount(value: number | string | null | undefined) {
  return `${value ?? "--"} ${CREDIT_UNIT_NAME}`;
}

export function showInsufficientCreditsToast({
  required,
  balance,
  onRecharge,
}: {
  required: number;
  balance: number | null | undefined;
  onRecharge: () => void;
}) {
  toast.error(`${CREDIT_UNIT_NAME}不足`, {
    description: `本次需要 ${required} ${CREDIT_UNIT_NAME}，当前余额 ${balance ?? "--"} ${CREDIT_UNIT_NAME}`,
    action: {
      label: "去充值",
      onClick: onRecharge,
    },
  });
}

/**
 * 生成任务提交响应的统一状态处理（各页面 401 自定义清理后调用）：
 * - 402 仅当服务端返回数字余额时更新（避免 ?? 0 覆盖真实余额并持久化）
 * - 非 ok 抛出带服务端信息的错误
 * - 成功时同步 credits_remaining 到本地缓存
 */
export function applyGenerationResponseStatus(opts: {
  res: Response;
  data: { error?: unknown; balance?: unknown; credits_remaining?: unknown };
  userId: string | null;
  setCredits: (credits: number) => void;
  fallbackError: string;
}): void {
  const { res, data, userId, setCredits, fallbackError } = opts;

  if (res.status === 402) {
    if (typeof data.balance === "number") {
      setCredits(data.balance);
      if (userId) setCachedProfileCredits(userId, data.balance);
    }
  }
  if (!res.ok) {
    throw new Error(typeof data.error === "string" && data.error ? data.error : fallbackError);
  }
  if (typeof data.credits_remaining === "number") {
    setCredits(data.credits_remaining);
    if (userId) setCachedProfileCredits(userId, data.credits_remaining);
  }
}
