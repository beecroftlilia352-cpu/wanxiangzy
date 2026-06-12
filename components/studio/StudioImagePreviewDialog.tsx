"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StudioImagePreviewWorkspace } from "@/components/studio/StudioImagePreviewWorkspace";
import type { ImagePreviewAction, ImagePreviewSession } from "@/lib/studio-image-preview";
import { cn } from "@/lib/utils";

type StudioImagePreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  session: ImagePreviewSession;
  filenamePrefix: string;
  extension?: string;
  selectedIndex: number;
  onSelectedIndexChange?: (index: number) => void;
  actions?: ImagePreviewAction[];
  onRegenerateOne?: (url: string | null, index: number) => void;
  onRegenerateAll?: () => void;
  onUseAsSource?: (url: string) => void;
  onUseAsFace?: (url: string) => void;
  className?: string;
};

export function StudioImagePreviewDialog({
  open,
  onClose,
  session,
  filenamePrefix,
  extension,
  selectedIndex,
  onSelectedIndexChange,
  actions,
  onRegenerateOne,
  onRegenerateAll,
  onUseAsSource,
  onUseAsFace,
  className,
}: StudioImagePreviewDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className={cn("studio-image-preview-dialog-content", className)}>
        <DialogTitle className="sr-only">{session.title}预览</DialogTitle>
        <DialogDescription className="sr-only">查看图片结果、输入参考、生成信息和后续可用动作。</DialogDescription>
        <StudioImagePreviewWorkspace
          session={session}
          filenamePrefix={filenamePrefix}
          extension={extension}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={onSelectedIndexChange}
          actions={actions}
          onRegenerateOne={onRegenerateOne}
          onRegenerateAll={onRegenerateAll}
          onUseAsSource={onUseAsSource}
          onUseAsFace={onUseAsFace}
          className="studio-image-preview-dialog-workspace"
        />
      </DialogContent>
    </Dialog>
  );
}
