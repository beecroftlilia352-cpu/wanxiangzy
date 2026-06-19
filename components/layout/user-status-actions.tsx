"use client";

import type { CSSProperties } from "react";
import { BookOpen, Keyboard } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { DOCS_URL } from "@/constant/env";
import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";

type UserStatusActionsProps = {
  showConfig?: boolean;
  variant?: "default" | "canvas";
  onOpenShortcuts?: () => void;
};

export function UserStatusActions({ variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const canvasTheme = canvasThemes[theme];
  const style: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
  const controlClass = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-stone-600 transition",
    "hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white",
    "[&_svg]:size-4",
  );

  return (
    <div className="inline-flex shrink-0 items-center gap-1">
      <a className={controlClass} style={style} href={DOCS_URL} target="_blank" rel="noreferrer" aria-label="打开文档" title="打开文档">
        <BookOpen />
      </a>
      <AnimatedThemeToggler
        className={controlClass}
        style={style}
        theme={theme}
        onThemeChange={setTheme}
        aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
        title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
      />
      {onOpenShortcuts ? (
        <button type="button" className={controlClass} style={style} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
          <Keyboard />
        </button>
      ) : null}
    </div>
  );
}
