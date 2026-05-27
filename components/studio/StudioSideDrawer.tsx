"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { ClientPortal } from "@/components/ClientPortal";
import { cn } from "@/lib/utils";

type StudioSideDrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  ariaLabel?: string;
  side?: "left" | "right";
  size?: "md" | "lg";
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

export function StudioSideDrawer({
  open,
  title,
  description,
  ariaLabel,
  side = "left",
  size = "lg",
  children,
  onClose,
  className,
}: StudioSideDrawerProps) {
  if (!open) return null;

  return (
    <ClientPortal>
      <div
        className="studio-side-drawer-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        onClick={onClose}
      >
        <aside
          className={cn(
            "studio-side-drawer-panel",
            side === "left" ? "studio-side-drawer-panel-left" : "studio-side-drawer-panel-right",
            size === "md" ? "studio-side-drawer-panel-md" : "studio-side-drawer-panel-lg",
            className
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="studio-side-drawer-header">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-slate-950">{title}</h2>
              {description && <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-100 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              aria-label={`关闭${title}`}
              title={`关闭${title}`}
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="studio-side-drawer-content">{children}</div>
        </aside>
      </div>
    </ClientPortal>
  );
}
