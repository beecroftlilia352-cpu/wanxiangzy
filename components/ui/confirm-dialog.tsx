"use client";

import { useState, useCallback } from "react";
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
  title?: string;
  content?: string;
  okText?: string;
  cancelText?: string;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
};

export function useConfirm() {
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{state.title || "确认"}</DialogTitle>
            {state.content ? <DialogDescription>{state.content}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {state.cancelText || "取消"}
            </Button>
            <Button onClick={handleOk}>
              {state.okText || "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ) : null,
  };
}
