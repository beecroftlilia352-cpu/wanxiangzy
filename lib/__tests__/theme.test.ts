import { beforeEach, describe, expect, it } from "vitest";

import {
  APP_THEME_BOOTSTRAP_SCRIPT,
  APP_THEME_COLORS,
  APP_THEME_STORAGE_KEY,
  applyDocumentTheme,
} from "@/lib/theme";

describe("application theme contract", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
          return values.size;
        },
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, String(value)),
      } satisfies Storage,
    });
    document.documentElement.className = "";
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  });

  it("stays light on first visit even when the operating system prefers dark", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true }),
    });

    window.eval(APP_THEME_BOOTSTRAP_SCRIPT);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      APP_THEME_COLORS.light,
    );
  });

  it("restores an explicit dark choice before hydration", () => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "dark");

    window.eval(APP_THEME_BOOTSTRAP_SCRIPT);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      APP_THEME_COLORS.dark,
    );
  });

  it("treats legacy system and invalid values as light", () => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "system");

    window.eval(APP_THEME_BOOTSTRAP_SCRIPT);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("persists only the user's explicit light or dark choice", () => {
    applyDocumentTheme("dark");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    applyDocumentTheme("light");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
