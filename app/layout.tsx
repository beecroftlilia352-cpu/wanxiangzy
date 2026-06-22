import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import "./styles/shared-components.css";
import "./styles/admin.css";
import "./styles/studio-primitives.css";
import "./styles/studio.css";
import "./styles/home.css";
import "./styles/studio-overrides.css";
import { HeaderClient } from "@/components/HeaderClient";
import { RouteProgress } from "@/components/ui/route-progress";
import "@/lib/env";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "VastWearGen - AI 服装视觉生产工作台",
  description: "面向服装品牌、电商团队和内容创作者的 AI 服装视觉生产工作台。",
  icons: {
    icon: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
    apple: [{ url: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)} style={{ colorScheme: "light dark" }} suppressHydrationWarning>
      <head>
        {/* P1.1 dark-mode bootstrap — runs before paint to avoid FOUC.
            P5.43: home page (/) is always light; never apply `dark` there. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=window.location.pathname;var isHome=p==='/'||p==='/index'||p==='';if(isHome){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';return;}var s=localStorage.getItem('vwg-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased transition-colors">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-codex-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-codex-accent focus:ring-offset-2"
        >
          跳到主内容
        </a>
        <RouteProgress />
        <HeaderClient />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
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
