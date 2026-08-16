"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  variant?: "default" | "batch-clear";
  title?: string;
  content?: string;
  okText?: string;
  cancelText?: string;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
};

export function useConfirm() {
  const t = useTranslations("Shared");
  const [state, setState] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setState(options);
  }, []);

  const handleOk = useCallback(async () => {
    if (state?.onOk) await state.onOk();
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.onCancel?.();
    setState(null);
  }, [state]);

  return {
    confirm,
    confirmDialog: state ? (
      <Dialog open onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent
          showCloseButton={state.variant !== "batch-clear"}
          overlayClassName={state.variant === "batch-clear" ? "studio-batch-clear-overlay" : undefined}
          className={state.variant === "batch-clear" ? "studio-batch-clear-dialog" : "max-w-sm"}
        >
          <DialogHeader className={state.variant === "batch-clear" ? "studio-batch-clear-header" : undefined}>
            <DialogTitle className={state.variant === "batch-clear" ? "studio-batch-clear-title" : undefined}>
              {state.title || t("confirmTitle")}
            </DialogTitle>
            {state.content ? (
              <DialogDescription className={state.variant === "batch-clear" ? "studio-batch-clear-description" : undefined}>
                {state.content}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {state.variant === "batch-clear" ? (
            <DialogFooter className="studio-batch-clear-footer">
              <Button variant="outline" onClick={handleOk} className="studio-batch-clear-button">
                {state.okText || t("ok")}
              </Button>
              <Button onClick={handleCancel} className="studio-batch-clear-button studio-batch-clear-cancel">
                {state.cancelText || t("cancel")}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {state.cancelText || t("cancel")}
              </Button>
              <Button onClick={handleOk}>
                {state.okText || t("ok")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    ) : null,
  };
}
