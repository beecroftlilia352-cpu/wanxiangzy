"use client";

import { App } from "@/components/ui/shadcn-compat";
import type { ReactNode } from "react";

/**
 * Admin area provider.
 *
 * NOTE: `@/components/ui/shadcn-compat` exposes a hand-rolled shadcn-style
 * component layer, NOT real Ant Design. Its `ConfigProvider` and `theme`
 * exports are no-op stubs, so any `algorithm` / `token` / `components` config
 * we hand to them is silently dropped at render time. Admin styling therefore
 * flows through (1) `app/globals.css` (consolidated `--admin-*` CSS variables
 * + `.dark` overrides, formerly `app/styles/admin.css`) and (2) Tailwind
 * utility classes on individual elements.
 *
 * For dark mode: `<ThemeToggle />` (placed in the admin top bar) flips the
 * `dark` class on `<html>`. `globals.css` reads that class and swaps every
 * `--admin-*` token. Component-level Tailwind utilities are migrated to
 * `var(--admin-*)` or admin palette utilities in subsequent commits.
 *
 * We keep the `<App>` wrapper here because it owns the `modal.confirm` flow
 * via shadcn-compat's AlertDialog — that's the only behavior that actually
 * renders at runtime.
 */
export function AdminUIProvider({ children }: { children: ReactNode }) {
  return <App>{children}</App>;
}