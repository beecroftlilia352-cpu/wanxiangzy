"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  // 移动端下拉关闭：拖拽超过 25% 宽度（或 80px）释放即关闭
  const dragRef = useRef<{ startX: number; dragging: boolean }>({ startX: 0, dragging: false });

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: event.clientX, dragging: true };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    const delta = side === "left" ? dragRef.current.startX - event.clientX : event.clientX - dragRef.current.startX;
    if (delta > 80) {
      dragRef.current.dragging = false;
      onClose();
    }
  }
  function onPointerUp() {
    dragRef.current.dragging = false;
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent
        side={side}
        overlayClassName="studio-side-drawer-overlay z-[230]"
        className={cn(
          "studio-side-drawer-panel studio-side-drawer-sheet-panel z-[231] gap-0 p-0 sm:max-w-none",
          side === "left" ? "studio-side-drawer-panel-left" : "studio-side-drawer-panel-right",
          size === "md" ? "studio-side-drawer-panel-md" : "studio-side-drawer-panel-lg",
          className
        )}
      >
        <div
          className="studio-side-drawer-grab-handle"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <SheetHeader className="studio-side-drawer-header pr-14 text-left">
          <SheetTitle className="truncate text-lg font-black text-slate-950">{title}</SheetTitle>
          <SheetDescription className={cn("text-xs font-semibold leading-5 text-slate-500", !description && "sr-only")}>
            {description || ariaLabel || `${title}侧边栏`}
          </SheetDescription>
        </SheetHeader>
        <div className="studio-side-drawer-content">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
