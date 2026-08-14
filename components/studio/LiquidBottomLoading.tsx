"use client";

import { motion } from "framer-motion";

const ease = [0.42, 0, 0.2, 1] as const;

function drift(duration: number) {
  return {
    duration,
    ease,
    repeat: Infinity,
    repeatType: "reverse" as const,
  };
}

/**
 * Full-card dark "liquid aurora" loading background. Uses framer-motion
 * (already a project dependency) for the blob drift instead of hand-rolled
 * CSS keyframes, so it keeps running on every route.
 */
export function LiquidBottomLoading() {
  return (
    <div className="studio-liquid-scene" aria-hidden="true">
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-a"
        animate={{ x: ["-26%", "14%", "-8%"], y: ["-14%", "12%", "-5%"], scale: [1, 1.3, 1.08], rotate: [-14, 10, -5] }}
        transition={drift(6.5)}
      />
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-b"
        animate={{ x: ["14%", "-18%", "6%"], y: ["-6%", "14%", "-10%"], scale: [1.06, 1.32, 1.1], rotate: [10, -10, 5] }}
        transition={drift(7.5)}
      />
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-c"
        animate={{ x: ["-12%", "18%", "-6%"], y: ["16%", "-8%", "8%"], scale: [1.04, 1.26, 1.08], rotate: [-8, 8, -3] }}
        transition={drift(7)}
      />
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-d"
        animate={{ x: ["8%", "-14%", "3%"], y: ["10%", "-16%", "5%"], scale: [1.1, 1.34, 1.12], rotate: [7, -9, 4] }}
        transition={drift(8)}
      />
    </div>
  );
}
