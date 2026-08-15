"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("Shared");
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className={cn("studio-image-preview-dialog-content", className)}
        onKeyDown={(event) => {
          const total = session.results.length;
          if (!total || total <= 1) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onSelectedIndexChange?.(selectedIndex > 0 ? selectedIndex - 1 : total - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            onSelectedIndexChange?.((selectedIndex + 1) % total);
          }
        }}
      >
        <DialogTitle className="sr-only">{session.title}{t("previewSuffix")}</DialogTitle>
        <DialogDescription className="sr-only">{t("previewDescription")}</DialogDescription>
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
