"use client";

/**
 * Full-card dark "liquid aurora" loading background. 纯 CSS 关键帧驱动
 * （见 app/styles/studio.css 的 studio-liquid-blob-* keyframes）。
 * 此前用 framer-motion 驱动漂移，但它会随 ResultImageGrid/ResultVideoGrid
 * 的静态引用进入所有 studio 页面共享包；换 CSS 后 framer-motion
 * 只保留在首页 Hero 与 outfit-fusion 的专属包里。
 */
export function LiquidBottomLoading() {
  return (
    <div className="studio-liquid-scene" aria-hidden="true">
      <span className="studio-liquid-blob studio-liquid-blob-a" />
      <span className="studio-liquid-blob studio-liquid-blob-b" />
      <span className="studio-liquid-blob studio-liquid-blob-c" />
      <span className="studio-liquid-blob studio-liquid-blob-d" />
    </div>
  );
}
