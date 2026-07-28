"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "vwg-theme";

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.style.colorScheme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore storage write failures (private mode / quota)
  }
}

export type ThemeToggleProps = React.ComponentPropsWithoutRef<"button"> & {
  /** Optional click handler (e.g. to close a parent popover). */
  onToggle?: (next: Theme) => void;
};

/**
 * Compact light/dark mode toggle. Renders a single button with a Sun/Moon icon
 * that swaps on click. Uses the View Transitions API when available for a smooth
 * cross-fade between themes; falls back to instant swap on older browsers.
 *
 * Persistence: stores the chosen theme in `localStorage[vwg-theme]`. The bootstrap
 * script in `app/layout.tsx` reads the same key before paint to avoid FOUC.
 */
export function ThemeToggle({ className, onToggle, onClick, ...props }: ThemeToggleProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Hydrate from DOM (set by bootstrap script) + listen for external changes.
  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;

      const next: Theme = theme === "dark" ? "light" : "dark";

      const apply = () => {
        applyTheme(next);
        setTheme(next);
        onToggle?.(next);
      };

      // Smooth transition when supported.
      const button = buttonRef.current;
      if (typeof document.startViewTransition === "function" && button) {
        const { top, left, width, height } = button.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const maxRadius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        const transition = document.startViewTransition(apply);
        try {
          // @ts-expect-error clip-path CSS may not be in TS lib yet
          transition?.animate?.({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] }, { duration: 250, easing: "cubic-bezier(0.22,1,0.36,1)", pseudoElement: "::view-transition-new(root)" });
        } catch {
          // pseudoElement animation is a nice-to-have; ignore failures.
        }
      } else {
        apply();
      }
    },
    [theme, onClick, onToggle],
  );

  // Render a stable placeholder until mounted to avoid hydration mismatch.
  const isDark = mounted && theme === "dark";
  const label = isDark ? "切换到浅色主题" : "切换到深色主题";

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      data-theme-toggle=""
      data-mounted={mounted ? "true" : "false"}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors",
        "hover:bg-slate-100 hover:text-slate-950",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white dark:focus-visible:ring-offset-stone-950",
        "active:scale-[0.96]",
        className,
      )}
      {...props}
    >
      <Sun aria-hidden="true" className={cn("h-4 w-4 transition-[transform,opacity]", isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
      <Moon aria-hidden="true" className={cn("-ml-4 h-4 w-4 transition-[transform,opacity]", isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
    </button>
  );
}
