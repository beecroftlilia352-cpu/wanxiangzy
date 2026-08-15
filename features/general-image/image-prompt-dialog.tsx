"use client";

import type { ChangeEvent, RefObject } from "react";
import { Copy, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type ImagePromptSource = {
  name: string;
  url: string;
  preview: string;
};

type ImagePromptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  image: ImagePromptSource | null;
  text: string;
  isUploading: boolean;
  isGenerating: boolean;
  onUpload: (files?: FileList) => void;
  onGenerate: () => void;
  onTextChange: (text: string) => void;
  onApply: () => void;
};

export function ImagePromptDialog({
  open,
  onOpenChange,
  fileInputRef,
  returnFocusRef,
  image,
  text,
  isUploading,
  isGenerating,
  onUpload,
  onGenerate,
  onTextChange,
  onApply,
}: ImagePromptDialogProps) {
  const t = useTranslations("GeneralImage");
  const handleCopy = async () => {
    if (!text.trim()) {
      toast.error(t("copyEmptyToast"));
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copySuccessToast"));
    } catch {
      toast.error(t("copyFailedToast"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        returnFocusRef={returnFocusRef}
        overlayClassName="z-[219] bg-slate-950/38 backdrop-blur-xl"
        className="z-[220] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-[22px] border border-[rgba(91,124,255,0.22)] bg-white p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-[rgba(91,124,255,0.18)] sm:max-w-2xl"
      >
        <div className="px-5 py-4 pr-14">
          <DialogTitle className="text-base font-black leading-6 text-slate-950">{t("imageToPromptButton")}</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-5 text-slate-500">
            {t("imageToPromptDesc")}
          </DialogDescription>
        </div>

        <div className="grid min-h-0 gap-4 overflow-y-auto px-5 pb-5 [overscroll-behavior:contain] sm:grid-cols-[120px_minmax(0,1fr)]">
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              name="image-prompt-source"
              accept="image/*"
              className="hidden"
              aria-label={t("uploadImageAria")}
              tabIndex={-1}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onUpload(event.target.files || undefined)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`group relative flex aspect-[3/4] w-full min-w-0 touch-manipulation items-center justify-center overflow-hidden rounded-xl border border-slate-200 text-slate-400 outline-none transition-[color,background-color,border-color,box-shadow] hover:border-[rgba(91,124,255,0.3)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2 ${
                image ? "studio-checkerboard" : "bg-slate-50 hover:bg-[rgba(91,124,255,0.12)]"
              }`}
              aria-label={image ? t("changeImageAria") : t("uploadImageAria")}
            >
              {image ? (
                <RawPreviewImage src={image.preview} alt={image.name} className="h-full w-full object-contain p-1" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-xs font-bold">
                  {isUploading ? (
                    <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-[var(--codex-accent)] motion-reduce:animate-none" />
                  ) : (
                    <ImagePlus aria-hidden="true" className="h-6 w-6 text-[var(--codex-accent)]" />
                  )}
                  {isUploading ? t("uploadingState") : t("uploadImageButton")}
                </span>
              )}
              {image ? (
                <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-slate-600 shadow-sm transition-colors group-hover:text-[var(--codex-accent)]">
                  <ImagePlus aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={!image || isUploading || isGenerating}
              className="flex h-9 w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 outline-none transition-[color,background-color,border-color,box-shadow] hover:border-[rgba(91,124,255,0.3)] hover:text-[var(--codex-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isGenerating ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {isGenerating ? t("generatingState") : t("retryGenerate")}
            </button>
          </div>

          <textarea
            name="image-prompt-text"
            value={text}
            onChange={(event) => onTextChange(event.target.value.slice(0, 4000))}
            placeholder={t("promptTextareaPlaceholder")}
            aria-label={t("promptTextareaAria")}
            maxLength={4000}
            className="min-h-[260px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[rgba(91,124,255,0.5)] focus:ring-2 focus:ring-[rgba(91,124,255,0.14)] sm:min-h-0"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex h-9 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 outline-none transition-[color,background-color,border-color,box-shadow] hover:text-[var(--codex-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.4)] focus-visible:ring-offset-2"
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            {t("copyButton")}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!text.trim()}
            className="gradient-brand inline-flex h-9 touch-manipulation items-center justify-center rounded-lg px-5 text-sm font-black text-white shadow-lg shadow-slate-300/40 outline-none transition-[opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.5)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("applyToDescription")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
