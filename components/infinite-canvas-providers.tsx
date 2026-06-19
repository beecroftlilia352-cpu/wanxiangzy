"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { getAntThemeConfig } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function InfiniteCanvasProviders({ children }: { children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const dark = theme === "dark";
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = theme;
  }, [dark, theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
        <App>{children}</App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
