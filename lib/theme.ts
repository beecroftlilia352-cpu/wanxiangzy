export const APP_THEME_STORAGE_KEY = "vwg-theme";
export const APP_THEME_CHANGE_EVENT = "vwg-theme-change";
export const APP_THEME_COLORS = {
  light: "#edf0f3",
  dark: "#111319",
} as const;

export type AppTheme = keyof typeof APP_THEME_COLORS;

export function normalizeStoredTheme(value: unknown): AppTheme {
  return value === "dark" ? "dark" : "light";
}

export function applyDocumentTheme(theme: AppTheme, options: { persist?: boolean } = {}) {
  const root = document.documentElement;
  const isDark = theme === "dark";
  root.classList.toggle("dark", isDark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute("content", APP_THEME_COLORS[theme]);

  if (options.persist !== false) {
    try {
      window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable in private browsing. The current page still updates.
    }
  }
}

/**
 * Runs before hydration. Missing, invalid, or legacy "system" values resolve to
 * light so the operating system can never switch the application theme.
 */
export const APP_THEME_BOOTSTRAP_SCRIPT = `
(function(){
  var root=document.documentElement;
  var theme="light";
  try{theme=localStorage.getItem("${APP_THEME_STORAGE_KEY}")==="dark"?"dark":"light";}catch(e){}
  var dark=theme==="dark";
  root.classList.toggle("dark",dark);
  root.dataset.theme=theme;
  root.style.colorScheme=theme;
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute("content",dark?"${APP_THEME_COLORS.dark}":"${APP_THEME_COLORS.light}");
})();`;
