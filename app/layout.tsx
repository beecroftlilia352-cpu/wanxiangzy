import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { HeaderClient } from "@/components/HeaderClient";

export const metadata: Metadata = {
  title: "万象衣造 AI｜VastWearGen",
  description: "万象衣造 AI｜VastWearGen，提供服装上身、姿势裂变和专属模特生成。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col">
        <HeaderClient />
        <main className="flex-1">{children}</main>
        <footer className="border-t py-3 text-center text-xs text-gray-400">
          <p>万象衣造 AI｜VastWearGen · 2026</p>
        </footer>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
