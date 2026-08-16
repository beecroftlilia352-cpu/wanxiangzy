"use client";

import { AlertCircle } from "lucide-react";

type Props = {
  message: string | null;
  id?: string;
};

/**
 * 登录页统一错误提示条。
 *
 * 出现错误时用 role="alert" + aria-live="polite" 提示给屏幕阅读器；
 * message 为空时返回 null，调用方无需自己判断。
 */
export function AuthErrorBanner({ message, id }: Props) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}