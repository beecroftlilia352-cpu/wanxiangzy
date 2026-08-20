"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const FLOW_BARS = [0, 1, 2, 3] as const;
const FLOW_EASE = [0.42, 0, 0.2, 1] as const;

export function TaskFlowIndicator({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <span
      className={cn("studio-task-flow-indicator", className)}
      data-size={size}
      aria-hidden="true"
    >
      {FLOW_BARS.map((index) => (
        <motion.span
          key={index}
          className="studio-task-flow-bar"
          initial={false}
          animate={prefersReducedMotion
            ? { opacity: 0.68, scaleY: 0.62 }
            : { opacity: [0.38, 1, 0.38], scaleY: [0.45, 1, 0.45] }}
          transition={prefersReducedMotion
            ? { duration: 0 }
            : { duration: 0.8, ease: FLOW_EASE, repeat: Infinity, delay: index * 0.09 }}
        />
      ))}
    </span>
  );
}
