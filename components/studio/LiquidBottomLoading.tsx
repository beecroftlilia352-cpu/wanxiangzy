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
        animate={{ x: ["-18%", "10%", "-6%"], y: ["-10%", "8%", "-4%"], scale: [1, 1.22, 1.06], rotate: [-10, 8, -4] }}
        transition={drift(9)}
      />
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-b"
        animate={{ x: ["10%", "-12%", "4%"], y: ["-4%", "10%", "-8%"], scale: [1.04, 1.24, 1.08], rotate: [8, -8, 4] }}
        transition={drift(11)}
      />
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-c"
        animate={{ x: ["-8%", "12%", "-4%"], y: ["12%", "-6%", "6%"], scale: [1.02, 1.18, 1.06], rotate: [-6, 6, -2] }}
        transition={drift(10)}
      />
      <motion.span
        className="studio-liquid-blob studio-liquid-blob-d"
        animate={{ x: ["6%", "-10%", "2%"], y: ["8%", "-12%", "4%"], scale: [1.08, 1.26, 1.1], rotate: [5, -7, 3] }}
        transition={drift(12)}
      />
    </div>
  );
}
