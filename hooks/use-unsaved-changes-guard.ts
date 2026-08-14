"use client";

import { useEffect, useRef } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * 未保存输入离开拦截：
 * - 页面有输入（图片/提示词/参考图等）时，点击站内导航链接弹出内部确认框
 * - 刷新/关闭标签页走浏览器原生 beforeunload 提示
 * - 生成成功、清空内容后由调用方把 isDirty 置回 false
 *
 * 用法：
 *   const { unsavedDialog } = useUnsavedChangesGuard(isDirty);
 *   在 JSX 末尾渲染 {unsavedDialog}
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options: { exemptPaths?: string[] } = {},
) {
  const { confirm, confirmDialog } = useConfirm();
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  // 用户已确认离开后放行本次卸载，避免浏览器再弹原生 beforeunload 提示
  const allowNavigationRef = useRef(false);
  // 组内切换白名单：同功能的不同视图之间跳转不拦截（如文生图<->图生图）
  const exemptPathsRef = useRef(options.exemptPaths || []);
  exemptPathsRef.current = options.exemptPaths || [];

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (exemptPathsRef.current.includes(url.pathname)) return;

      event.preventDefault();
      confirm({
        title: "离开当前页面？",
        content: "当前页面有未保存的输入内容，离开后这些内容将丢失。",
        okText: "离开",
        cancelText: "继续编辑",
        onOk: () => {
          allowNavigationRef.current = true;
          window.location.href = href;
        },
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [confirm]);

  // 浏览器前进/后退：popstate 无法阻止，用 pushState 锚定当前 URL 并弹确认，
  // 确认离开后才放行历史导航
  useEffect(() => {
    const onPopState = () => {
      if (!dirtyRef.current || allowNavigationRef.current) return;
      window.history.pushState(null, "", window.location.href);
      confirm({
        title: "离开当前页面？",
        content: "当前页面有未保存的输入内容，离开后这些内容将丢失。",
        okText: "离开",
        cancelText: "继续编辑",
        onOk: () => {
          allowNavigationRef.current = true;
          window.history.back();
        },
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [confirm]);

  return { unsavedDialog: confirmDialog };
}
