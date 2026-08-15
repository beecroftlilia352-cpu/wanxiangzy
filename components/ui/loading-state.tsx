import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type LoadingStateProps = React.ComponentProps<"div"> & {
  title?: React.ReactNode
  description?: React.ReactNode
  skeletonRows?: number
}

function LoadingState({
  className,
  title,
  description,
  skeletonRows = 0,
  ...props
}: LoadingStateProps) {
  const t = useTranslations("Shared");
  return (
    <div
      data-slot="loading-state"
      className={cn("rounded-lg border bg-card p-4 text-card-foreground", className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <div>
          <div className="text-sm font-semibold">{title ?? t("loading")}</div>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
      </div>
      {skeletonRows > 0 ? (
        <div className="mt-4 grid gap-2">
          {Array.from({ length: skeletonRows }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export { LoadingState }
