"use client";

/**
 * Dark gooey "liquid" that churns at the bottom of a generating card.
 * Overlapping blurred/contrast-merged blobs rise and fall like boiling liquid,
 * with a lighter foam rim along the surface (DeepSeek / Jimeng style).
 */
export function LiquidBottomLoading() {
  return (
    <div className="studio-liquid-bottom-loading" aria-hidden="true">
      <span className="studio-liquid-goo">
        <span className="studio-liquid-dot studio-liquid-dot-1" />
        <span className="studio-liquid-dot studio-liquid-dot-2" />
        <span className="studio-liquid-dot studio-liquid-dot-3" />
        <span className="studio-liquid-dot studio-liquid-dot-4" />
      </span>
      <span className="studio-liquid-foam" />
    </div>
  );
}
