import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { HeaderClient } from "@/components/HeaderClient";
import "@/lib/env";

export const metadata: Metadata = {
  title: "VastWearGen - AI 服装视觉生产工作台",
  description: "面向服装品牌、电商团队和内容创作者的 AI 服装视觉生产工作台。",
  icons: {
    icon: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
    apple: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen text-codex-ink">
        <HeaderClient />
        <main>{children}</main>
        <Toaster
          richColors
          closeButton
          expand={false}
          visibleToasts={1}
          gap={8}
          duration={2400}
          position="top-right"
          offset={{ top: 76, right: 18 }}
          mobileOffset={{ top: 70, right: 12, left: 12 }}
        />
      </body>
    </html>
  );
}
