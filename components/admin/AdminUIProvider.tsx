"use client";

import { App, ConfigProvider, theme, zhCN } from "@/components/ui/shadcn-compat";
import type { ReactNode } from "react";

export function AdminUIProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{
        algorithm: theme.compactAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          colorInfo: "#1677ff",
          colorSuccess: "#16a34a",
          colorWarning: "#d97706",
          colorError: "#dc2626",
          colorTextBase: "#0f172a",
          colorBgLayout: "#f6f8fb",
          borderRadius: 8,
          borderRadiusLG: 8,
          fontFamily:
            'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 13,
          motion: false,
          wireframe: false,
        },
        components: {
          Layout: {
            bodyBg: "#f6f8fb",
            headerBg: "rgba(255,255,255,0.92)",
            siderBg: "#ffffff",
          },
          Menu: {
            itemBorderRadius: 8,
            itemHeight: 38,
            iconSize: 15,
          },
          Card: {
            borderRadiusLG: 8,
            headerBg: "#ffffff",
          },
          Table: {
            headerBg: "#f8fafc",
            rowHoverBg: "#f8fafc",
            cellPaddingBlockSM: 8,
            cellPaddingInlineSM: 12,
          },
          Button: {
            borderRadius: 8,
            controlHeight: 34,
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
