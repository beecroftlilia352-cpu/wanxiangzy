"use client";

import { Eraser } from "lucide-react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * 模块头部紧凑"清空"按钮：确认后清空当前输入（图片/参考/提示词），
 * 不占用操作区垂直空间（放在标题行右侧 actions 插槽）。
 */
export function StudioClearButton({
  onClear,
  label,
  disabled = false,
  description,
}: {
  onClear: () => void;
  label?: string;
  disabled?: boolean;
  description?: string;
}) {
  const t = useTranslations("Shared");
  const { confirm, confirmDialog } = useConfirm();

  return (
    <>
      {confirmDialog}
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          confirm({
            title: t("clearContentTitle"),
            content: description ?? t("clearDescription"),
            okText: t("confirmClear"),
            cancelText: t("cancel"),
            onOk: onClear,
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] px-3 text-xs font-bold text-[var(--codex-muted)] transition-colors duration-150 hover:border-[rgba(209,59,53,0.45)] hover:text-[var(--codex-danger)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Eraser className="h-3.5 w-3.5" />
        {label ?? t("clear")}
      </button>
    </>
  );
}
