import * as React from "react"
import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ErrorStateProps = React.ComponentProps<"div"> & {
  title?: React.ReactNode
  description?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
}

function ErrorState({
  className,
  title,
  description,
  actionLabel,
  onAction,
  ...props
}: ErrorStateProps) {
  const t = useTranslations("Shared");
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-4", className)}
      {...props}
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{title ?? t("loadFailed")}</div>
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : <div className="mt-1 text-sm text-muted-foreground">{t("loadFailedDesc")}</div>}
          {actionLabel && onAction ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export { ErrorState }
