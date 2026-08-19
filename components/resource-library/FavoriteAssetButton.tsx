"use client";

import { Loader2, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useResourceFavorite } from "@/hooks/use-resource-favorite";
import type { ResourceFavoriteDescriptor } from "@/components/resource-library/resource-favorite-types";
import { cn } from "@/lib/utils";

type FavoriteAssetButtonProps = {
  descriptor: ResourceFavoriteDescriptor | null | undefined;
  variant?: "icon" | "action";
  className?: string;
  saveLabel?: string;
  savedLabel?: string;
  removeLabel?: string;
  errorLabel?: string;
};

export function FavoriteAssetButton({
  descriptor,
  variant = "icon",
  className,
  saveLabel,
  savedLabel,
  removeLabel,
  errorLabel,
}: FavoriteAssetButtonProps) {
  const t = useTranslations("ResourceLibrary");
  const favorite = useResourceFavorite(descriptor);
  if (!descriptor) return null;

  const resolvedSaveLabel = saveLabel ?? t("actions.add");
  const resolvedSavedLabel = savedLabel ?? t("actions.added");
  const resolvedRemoveLabel = removeLabel ?? t("actions.remove");
  const resolvedErrorLabel = errorLabel ?? t("states.operationFailed");
  const label = favorite.isSaved ? resolvedRemoveLabel : resolvedSaveLabel;
  const pending = favorite.isPending || favorite.isChecking;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={favorite.isSaved}
      title={favorite.isSaved ? resolvedSavedLabel : resolvedSaveLabel}
      disabled={pending}
      data-saved={favorite.isSaved ? "true" : "false"}
      data-pending={pending ? "true" : "false"}
      className={cn(
        "inline-flex touch-manipulation items-center justify-center gap-1.5 rounded-full border outline-none transition-[color,background-color,border-color,box-shadow,transform,opacity] focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-45)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70",
        variant === "icon"
          ? "h-9 w-9 border-white/80 bg-white/92 p-0 text-codex-ink shadow-lg backdrop-blur hover:-translate-y-0.5 hover:bg-white"
          : "h-9 border-[var(--codex-border)] bg-white px-3 text-xs font-bold text-codex-ink shadow-sm hover:border-[var(--codex-accent-30)] hover:text-[var(--codex-accent)]",
        favorite.isSaved && "border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-600",
        className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void favorite.toggle().catch((error) => {
          toast.error(error instanceof Error && error.message ? error.message : resolvedErrorLabel);
        });
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Star aria-hidden="true" className={cn("h-4 w-4", favorite.isSaved && "fill-current")} />
      )}
      {variant === "action" ? <span>{favorite.isSaved ? resolvedSavedLabel : resolvedSaveLabel}</span> : null}
    </button>
  );
}
