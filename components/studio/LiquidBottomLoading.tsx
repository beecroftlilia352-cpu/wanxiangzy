"use client";

/**
 * Deep dark "liquid" loading layer that churns at the bottom of a generating
 * card. The blob morphs its border-radius + drifts to read as a viscous fluid,
 * with a lighter foam tide along its top edge.
 */
export function LiquidBottomLoading() {
  return (
    <div className="studio-liquid-bottom-loading" aria-hidden="true">
      <span className="studio-liquid-blob studio-liquid-blob-a" />
      <span className="studio-liquid-blob studio-liquid-blob-b" />
      <span className="studio-liquid-blob studio-liquid-blob-c" />
      <span className="studio-liquid-foam" />
    </div>
  );
}
