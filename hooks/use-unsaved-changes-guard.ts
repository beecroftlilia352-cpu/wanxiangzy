"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  requestStudioNavigation,
  STUDIO_NAVIGATION_REQUEST_EVENT,
  type StudioNavigationRequestDetail,
} from "@/lib/studio-navigation";

/**
 * One navigation gate for links, task-card router pushes, browser history and
 * full-page unloads. Every SPA navigation is stopped before the route changes.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options: { exemptPaths?: string[] } = {},
) {
  const { confirm, confirmDialog } = useConfirm();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Shared");
  const dirtyRef = useRef(isDirty);
  const allowUnloadRef = useRef(false);
  const currentHrefRef = useRef("");
  const pendingRequestRef = useRef<StudioNavigationRequestDetail | null>(null);
  const exemptPathsRef = useRef(options.exemptPaths || []);
  dirtyRef.current = isDirty;
  exemptPathsRef.current = options.exemptPaths || [];

  useEffect(() => {
    currentHrefRef.current = window.location.href;
  }, [pathname]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || allowUnloadRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    const onNavigationRequest = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<StudioNavigationRequestDetail>;
      const request = event.detail;
      if (!request?.href) return;

      const target = new URL(request.href, window.location.origin);
      const samePath = target.pathname === window.location.pathname;
      const exempt = exemptPathsRef.current.includes(target.pathname);
      if (!dirtyRef.current || allowUnloadRef.current || samePath || exempt) return;

      event.preventDefault();
      pendingRequestRef.current?.cancel();
      pendingRequestRef.current = request;
      confirm({
        title: t("leaveConfirmTitle"),
        content: t("leaveConfirmContent"),
        okText: t("leaveConfirmOk"),
        cancelText: t("leaveConfirmCancel"),
        onOk: async () => {
          if (pendingRequestRef.current === request) pendingRequestRef.current = null;
          await request.proceed();
        },
        onCancel: () => {
          if (pendingRequestRef.current === request) pendingRequestRef.current = null;
          request.cancel();
        },
      });
    };

    window.addEventListener(STUDIO_NAVIGATION_REQUEST_EVENT, onNavigationRequest);
    return () => {
      window.removeEventListener(STUDIO_NAVIGATION_REQUEST_EVENT, onNavigationRequest);
      pendingRequestRef.current?.cancel();
      pendingRequestRef.current = null;
    };
  }, [confirm, t]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || allowUnloadRef.current) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      const target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname) return;
      if (exemptPathsRef.current.includes(target.pathname)) return;

      // Capture phase + immediate propagation stop guarantees Next's Link
      // handler cannot switch the page underneath the confirmation dialog.
      event.preventDefault();
      event.stopImmediatePropagation();
      void requestStudioNavigation(href, () => {
        allowUnloadRef.current = true;
        router.push(href);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  useEffect(() => {
    const onPopState = () => {
      if (!dirtyRef.current || allowUnloadRef.current) {
        currentHrefRef.current = window.location.href;
        return;
      }

      const targetHref = window.location.href;
      const previousHref = currentHrefRef.current;
      const target = new URL(targetHref);
      if (exemptPathsRef.current.includes(target.pathname)) {
        currentHrefRef.current = targetHref;
        return;
      }

      // popstate itself is not cancellable. Restore the visible URL first,
      // then run the same gate and leave only after explicit confirmation.
      window.history.pushState(window.history.state, "", previousHref);
      void requestStudioNavigation(targetHref, () => {
        allowUnloadRef.current = true;
        window.location.assign(targetHref);
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return { unsavedDialog: confirmDialog };
}
