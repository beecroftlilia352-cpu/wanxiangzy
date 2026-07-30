"use client";

import { motion } from "framer-motion";

type HeroGradientMotionProps = {
  compact?: boolean;
  pace?: "default" | "calm";
};

const slowEase = [0.42, 0, 0.2, 1] as const;

export function HeroGradientMotion({ compact = false, pace = "default" }: HeroGradientMotionProps) {
  const duration = (value: number) => value * (pace === "calm" ? 1.55 : 1);
  const moving = {
    animate: {
      x: ["-14%", "10%", "-5%", "-14%"],
      y: ["-8%", "8%", "2%", "-8%"],
      rotate: [-10, 6, -4, -10],
      scale: [1.02, 1.18, 1.08, 1.02],
    },
    transition: {
      duration: duration(compact ? 8 : 9.5),
      ease: slowEase,
      repeat: Infinity,
    },
  };

  const counter = {
    animate: {
      x: ["10%", "-9%", "5%", "10%"],
      y: ["3%", "-8%", "7%", "3%"],
      rotate: [8, -7, 3, 8],
      scale: [1.04, 1.22, 1.1, 1.04],
    },
    transition: {
      duration: duration(compact ? 10 : 12),
      ease: slowEase,
      repeat: Infinity,
    },
  };

  const tide = {
    animate: {
      x: ["-14%", "7%", "-6%", "-14%"],
      y: ["8%", "-5%", "4%", "8%"],
      scale: [1, 1.2, 1.08, 1],
    },
    transition: {
      duration: duration(compact ? 8.5 : 10.5),
      ease: slowEase,
      repeat: Infinity,
    },
  };

  const sheen = {
    animate: {
      x: ["-34%", "28%", "-10%", "-34%"],
      rotate: [-12, 6, -3, -12],
      opacity: [0.5, 0.88, 0.62, 0.5],
    },
    transition: {
      duration: duration(compact ? 6.5 : 7.5),
      ease: slowEase,
      repeat: Infinity,
    },
  };

  const current = {
    animate: {
      x: ["-36%", "30%", "-18%", "-36%"],
      y: ["-8%", "6%", "-3%", "-8%"],
      rotate: [-16, 7, -10, -16],
      opacity: [0.52, 0.92, 0.64, 0.52],
    },
    transition: {
      duration: duration(compact ? 4.8 : 5.6),
      ease: slowEase,
      repeat: Infinity,
    },
  };

  return (
    <div className={`home-hero-gradient ${compact ? "home-hero-gradient-compact" : ""}`} aria-hidden="true">
      <motion.div className="home-hero-aurora home-hero-aurora-blue" {...moving} />
      <motion.div className="home-hero-aurora home-hero-aurora-violet" {...counter} />
      <motion.div className="home-hero-aurora home-hero-aurora-ice" {...moving} />
      <motion.div className="home-hero-tide" {...tide} />
      <motion.div className="home-hero-sheen" {...sheen} />
      <motion.div className="home-hero-current" {...current} />
      <div className="home-hero-noise" />
    </div>
  );
}
