"use client";

import { HeroGradientMotion } from "@/components/home/HeroGradientMotion";

export function StudioHomeHeroLoadingBackdrop() {
  return (
    <div className="studio-home-hero-loading-bg" aria-hidden="true">
      <HeroGradientMotion compact pace="calm" />
    </div>
  );
}
