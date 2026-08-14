"use client";

const PERMISSION_KEY = "pxd-notification-permission";

/**
 * 浏览器通知：生成完成时提醒切走的用户。
 * 首次生成时静默申请权限；拒绝后不再打扰（30 天内）。
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;

  const deniedAt = localStorage.getItem(`${PERMISSION_KEY}-denied`);
  if (deniedAt && Date.now() - Number(deniedAt) < 30 * 24 * 60 * 60 * 1000) return false;

  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    localStorage.setItem(`${PERMISSION_KEY}-denied`, String(Date.now()));
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") return true;
    if (permission === "denied") {
      localStorage.setItem(`${PERMISSION_KEY}-denied`, String(Date.now()));
    }
    return false;
  } catch {
    return false;
  }
}

export function notifyGenerationComplete(opts: {
  title: string;
  body: string;
  url?: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // 用户正看着页面时不用通知

  try {
    const notification = new Notification(opts.title, {
      body: opts.body,
      icon: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png",
      tag: `pxd-generation-${Date.now()}`,
    });
    if (opts.url) {
      notification.onclick = () => {
        window.focus();
        window.location.href = opts.url || "/history";
      };
    }
  } catch {
    // 通知失败静默（部分浏览器限制）
  }
}
