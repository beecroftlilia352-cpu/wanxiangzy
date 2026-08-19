"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { StudioImageEditor, type StudioImageEditorProps } from "./StudioImageEditor";
import { hasVisibleMaskContent } from "./mask-export";
import styles from "./studio-mask-editor-dialog.module.css";

export type StudioMaskEditorDialogProps = Omit<
  StudioImageEditorProps,
  "presentation" | "showSelectionPreview" | "toolbarActions" | "onSessionChange"
> & {
  open: boolean;
  instruction?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  hasBaseSelection?: boolean;
  quickSelection?: {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  };
  onCancel: () => void;
  onConfirm: (session: StudioImageEditorProps["session"]) => void;
};

export function StudioMaskEditorDialog({
  open,
  instruction = "请在原图上标记需要处理的区域",
  confirmLabel = "确定",
  confirmDisabled = false,
  hasBaseSelection = false,
  quickSelection,
  onCancel,
  onConfirm,
  session,
  ...editorProps
}: StudioMaskEditorDialogProps) {
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [draftSession, setDraftSession] = useState(session);
  const initialSessionRef = useRef(session);
  const [selectionActionPending, setSelectionActionPending] = useState(false);
  const previousOpenRef = useRef(false);
  const previousSourceIdRef = useRef(editorProps.sourceId);
  const hasSelection = useMemo(
    () => hasVisibleMaskContent(draftSession.present),
    [draftSession.present],
  );

  useEffect(() => {
    const isNewEditingSession = open
      && (!previousOpenRef.current || previousSourceIdRef.current !== editorProps.sourceId);
    if (isNewEditingSession) {
      initialSessionRef.current = session;
      setDraftSession(session);
      setCancelConfirmationOpen(false);
      setSelectionActionPending(false);
    }
    previousOpenRef.current = open;
    previousSourceIdRef.current = editorProps.sourceId;
  }, [editorProps.sourceId, open, session]);

  const requestCancel = () => {
    if (draftSession === initialSessionRef.current) {
      onCancel();
      return;
    }
    setCancelConfirmationOpen(true);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestCancel();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={`${styles.content} max-w-none sm:max-w-none`}
          overlayClassName={styles.overlay}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestCancel();
          }}
        >
          <DialogTitle className="sr-only">手动调整选区</DialogTitle>
          <DialogDescription className="sr-only">
            在左侧原图上编辑，右侧实时显示从原图中裁出的选区内容。
          </DialogDescription>
          <StudioImageEditor
            {...editorProps}
            session={draftSession}
            onSessionChange={setDraftSession}
            onSelectionActionPendingChange={(pending) => {
              setSelectionActionPending(pending);
              editorProps.onSelectionActionPendingChange?.(pending);
            }}
            presentation="dialog"
            showSelectionPreview
            toolbarActions={(
              <>
                <Button type="button" variant="outline" size="sm" onClick={requestCancel}>
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={confirmDisabled
                    || editorProps.disabled
                    || selectionActionPending
                    || (!hasSelection && !hasBaseSelection)}
                  onClick={() => onConfirm(draftSession)}
                >
                  {confirmLabel}
                </Button>
              </>
            )}
          />
          <p className={styles.instruction}>{instruction}</p>
          {quickSelection ? (
            <div className={styles.quickSelection} role="radiogroup" aria-label={quickSelection.label}>
              <strong>{quickSelection.label}</strong>
              <div>
                {quickSelection.options.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={quickSelection.value === option.value ? "default" : "outline"}
                    role="radio"
                    aria-checked={quickSelection.value === option.value}
                    onClick={() => quickSelection.onChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <Button className={styles.shortcutButton} type="button" size="sm" variant="ghost">
                <Keyboard aria-hidden="true" />快捷键说明
              </Button>
            </PopoverTrigger>
            <PopoverContent className={styles.shortcutPopover} side="top" align="end">
              <PopoverTitle>操作小技巧</PopoverTitle>
              <dl>
                <div><dt>画布缩放</dt><dd>滚轮</dd></div>
                <div><dt>拖拽</dt><dd>长按空格 + 左键</dd></div>
                <div><dt>上一步</dt><dd>Ctrl + Z</dd></div>
                <div><dt>下一步</dt><dd>Ctrl + Shift + Z</dd></div>
                <div><dt>画笔缩放</dt><dd>Ctrl + 滚轮</dd></div>
              </dl>
            </PopoverContent>
          </Popover>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelConfirmationOpen} onOpenChange={setCancelConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出手动调整？</AlertDialogTitle>
            <AlertDialogDescription>当前选区不会保留，是否确认退出？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续调整</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel}>确认退出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
