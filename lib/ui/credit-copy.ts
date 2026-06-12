import { toast } from "sonner";

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
