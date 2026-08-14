"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RulesPopoverPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

/**
 * 上传规则气泡的共享状态机：hover/focus 打开，离开后延迟关闭，
 * 定位在触发按钮右下方并夹在视口内。此前在 6 个页面复制粘贴，
 * 且宽度常量已漂移（720 vs 760），统一收敛到这里。
 */
export function useRulesPopover(options: { width?: number; closeDelayMs?: number } = {}) {
  const { width = 720, closeDelayMs = 180 } = options;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [show, setShow] = useState(false);
  const [style, setStyle] = useState<RulesPopoverPosition | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    cancelHide();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverWidth = Math.min(width, window.innerWidth - 32);
    const top = Math.max(16, Math.min(rect.top - 10, window.innerHeight - 360));
    const left = Math.max(16, Math.min(rect.right + 12, window.innerWidth - popoverWidth - 16));
    setStyle({
      top,
      left,
      maxHeight: Math.max(320, window.innerHeight - top - 16),
    });
    setShow(true);
  }, [cancelHide, width]);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      setShow(false);
      setStyle(null);
    }, closeDelayMs);
  }, [cancelHide, closeDelayMs]);

  const close = useCallback(() => {
    cancelHide();
    setShow(false);
    setStyle(null);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  return { buttonRef, show, style, open, scheduleHide, close, cancelHide };
}
