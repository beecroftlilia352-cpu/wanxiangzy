"use client";

import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";

const LIQUID_EASE = [0.42, 0, 0.2, 1] as const;

type LiquidBlob = {
  className: string;
  duration: number;
  animate: TargetAndTransition;
  resting: TargetAndTransition;
};

const LIQUID_BLOBS: LiquidBlob[] = [
  {
    className: "studio-liquid-blob-a",
    duration: 5.2,
    animate: { x: ["-26%", "14%", "-8%"], y: ["-14%", "12%", "-5%"], scale: [1, 1.3, 1.08], rotate: [-14, 10, -5] },
    resting: { x: "-26%", y: "-14%", scale: 1, rotate: -14 },
  },
  {
    className: "studio-liquid-blob-b",
    duration: 6,
    animate: { x: ["14%", "-18%", "6%"], y: ["-6%", "14%", "-10%"], scale: [1.06, 1.32, 1.1], rotate: [10, -10, 5] },
    resting: { x: "14%", y: "-6%", scale: 1.06, rotate: 10 },
  },
  {
    className: "studio-liquid-blob-c",
    duration: 5.6,
    animate: { x: ["-12%", "18%", "-6%"], y: ["16%", "-8%", "8%"], scale: [1.04, 1.26, 1.08], rotate: [-8, 8, -3] },
    resting: { x: "-12%", y: "16%", scale: 1.04, rotate: -8 },
  },
  {
    className: "studio-liquid-blob-d",
    duration: 6.4,
    animate: { x: ["8%", "-14%", "3%"], y: ["10%", "-16%", "5%"], scale: [1.1, 1.34, 1.12], rotate: [7, -9, 4] },
    resting: { x: "8%", y: "10%", scale: 1.1, rotate: 7 },
  },
];

function useSceneInView(ref: RefObject<HTMLDivElement | null>) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const scene = ref.current;
    if (!scene || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: "20%" },
    );
    observer.observe(scene);
    return () => observer.disconnect();
  }, [ref]);

  return isInView;
}

/** Full-card liquid aurora. Framer Motion owns all blob movement. */
export function LiquidBottomLoading() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const isInView = useSceneInView(sceneRef);
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = isInView && !prefersReducedMotion;

  return (
    <div
      ref={sceneRef}
      className={`studio-liquid-scene${shouldAnimate ? " studio-liquid-scene-active" : ""}`}
      aria-hidden="true"
    >
      {LIQUID_BLOBS.map((blob) => (
        <motion.span
          key={blob.className}
          className={`studio-liquid-blob ${blob.className}`}
          initial={false}
          animate={shouldAnimate ? blob.animate : blob.resting}
          transition={
            shouldAnimate
              ? { duration: blob.duration, ease: LIQUID_EASE, repeat: Infinity, repeatType: "reverse" }
              : { duration: 0 }
          }
        />
      ))}
    </div>
  );
}
