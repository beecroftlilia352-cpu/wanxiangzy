"use client";

import { motion, useReducedMotion } from "framer-motion";

const DOTS = [0, 1, 2] as const;

export function TaskSwitchLoading({ label }: { label: string }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="studio-task-switch-loading inline-flex items-center gap-2.5 text-sm font-medium text-codex-muted">
      <span className="studio-task-switch-dots" aria-hidden="true">
        {DOTS.map((index) => (
          <motion.span
            key={index}
            className="studio-task-switch-dot"
            initial={false}
            animate={prefersReducedMotion ? { opacity: 0.72, y: 0 } : { opacity: [0.42, 1, 0.42], y: [0, -4, 0] }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.9, ease: "easeInOut", repeat: Infinity, delay: index * 0.12 }
            }
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
