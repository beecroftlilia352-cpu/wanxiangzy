import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 顶导 / 侧导 tab 上的「NEW / BETA」类角标。
 *
 * 设计要点：
 * - 红色实心 + 白字，对比强烈，扫一眼就能注意到新功能
 * - 倾斜 -10° + 投影 + 白边，挂在文字右上角时不抢戏但又有质感
 * - 不依赖颜色库：复用 `--codex-danger` 主题色，自动跟随明暗模式
 *
 * a11y：默认对屏幕阅读器隐藏（角标是装饰性的视觉强调）。如果角标文字本身
 * 携带了独立于父链接的信息（例如「BETA」对未激活用户是重要状态），传
 * `decorative={false}` 让它进入父链接的可访问名。
 */
export type StudioTabBadgeProps = {
  children: ReactNode;
  className?: string;
  /** 渲染位置：默认 top-right 倾斜悬挂 */
  variant?: "floating" | "inline";
  /** 标记为装饰元素时（默认 true）从父可访问名中排除；false 时由父链接读出 */
  decorative?: boolean;
};

export function StudioTabBadge({
  children,
  className,
  variant = "floating",
  decorative = true,
}: StudioTabBadgeProps) {
  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      className={cn(
        "studio-tab-badge",
        variant === "inline"
          ? "studio-tab-badge-inline"
          : "studio-tab-badge-floating",
        className
      )}
    >
      {children}
    </span>
  );
}