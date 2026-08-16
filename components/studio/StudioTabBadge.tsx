import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 顶导 / 侧导 tab 上的「NEW / BETA」类角标。
 *
 * 设计要点：
 * - 深灰实心胶囊 + 白字，对齐产品顶部导航参考样式
 * - 无旋转、无彩色投影，紧贴文字右上方
 * - NEW 统一呈现为更自然的 `New`
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
  const displayLabel = typeof children === "string" && children.toUpperCase() === "NEW"
    ? "New"
    : children;

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
      {displayLabel}
    </span>
  );
}
