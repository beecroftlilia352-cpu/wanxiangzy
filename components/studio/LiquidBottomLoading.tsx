"use client";

/** A restrained render surface. Progress and the spinner carry the motion. */
export function LiquidBottomLoading() {
  return (
    <div className="studio-liquid-scene" aria-hidden="true">
      <span className="studio-liquid-scan" />
    </div>
  );
}
