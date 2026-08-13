"use client";

import { LiquidBottomLoading } from "@/components/studio/LiquidBottomLoading";

export function StudioHomeHeroLoadingBackdrop() {
  return (
    <div className="studio-home-hero-loading-bg" aria-hidden="true">
      <LiquidBottomLoading />
    </div>
  );
}
