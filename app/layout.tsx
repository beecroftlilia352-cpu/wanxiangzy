import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import "./styles/shared-components.css";
import "./styles/studio-primitives.css";
import "./styles/studio.css";
import "./styles/studio-overrides.css";
import { HeaderClient } from "@/components/HeaderClient";
import { RouteProgress } from "@/components/ui/route-progress";
import "@/lib/env";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { getSiteMonitoringConfig } from "@/lib/site-config";
import { SentryBootstrap } from "@/components/SentryBootstrap";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "arial"],
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const configured = await getSiteMonitoringConfig().catch(() => null);
  return {
    title: {
      default: configured?.seoTitle || "Pixel Diffusion - AI 服装视觉生产工作台",
      template: "%s | Pixel Diffusion",
    },
    description: configured?.seoDescription || "Pixel Diffusion 面向服装品牌、电商团队和内容创作者的 AI 服装视觉生产工作台：服装上身、姿势裂变、商品套图、种草封面，一次上传生成整套商业成片。",
    keywords: ["AI 服装", "服装上身", "AI 模特", "姿势裂变", "商品套图", "电商视觉", "种草图", "Pixel Diffusion"],
    icons: {
      icon: [{ url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
      apple: [{ url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: "https://pixel-diffusion.com",
      siteName: "Pixel Diffusion",
      title: configured?.seoTitle || "Pixel Diffusion - AI 服装视觉生产工作台",
      description: configured?.seoDescription || "服装上身、姿势裂变、商品套图、种草封面——一次上传，生成整套电商商业成片。",
      images: [
        {
          url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-hero-workspace.png",
          width: 1200,
          height: 630,
          alt: "Pixel Diffusion AI 服装视觉生产工作台",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: configured?.seoTitle || "Pixel Diffusion - AI 服装视觉生产工作台",
      description: configured?.seoDescription || "服装上身、姿势裂变、商品套图、种草封面——一次上传，生成整套电商商业成片。",
      images: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-hero-workspace.png"],
    },
    alternates: { canonical: "https://pixel-diffusion.com" },
    robots: { index: true, follow: true },
  };
}

export const metadata: Metadata = {
  title: {
    default: "Pixel Diffusion - AI 服装视觉生产工作台",
    template: "%s | Pixel Diffusion",
  },
  description: "Pixel Diffusion 面向服装品牌、电商团队和内容创作者的 AI 服装视觉生产工作台：服装上身、姿势裂变、商品套图、种草封面，一次上传生成整套商业成片。",
  keywords: ["AI 服装", "服装上身", "AI 模特", "姿势裂变", "商品套图", "电商视觉", "种草图", "Pixel Diffusion"],
  icons: {
    icon: [{ url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
    apple: [{ url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://pixel-diffusion.com",
    siteName: "Pixel Diffusion",
    title: "Pixel Diffusion - AI 服装视觉生产工作台",
    description: "服装上身、姿势裂变、商品套图、种草封面——一次上传，生成整套电商商业成片。",
    images: [
      {
        url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-hero-workspace.png",
        width: 1200,
        height: 630,
        alt: "Pixel Diffusion AI 服装视觉生产工作台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pixel Diffusion - AI 服装视觉生产工作台",
    description: "服装上身、姿势裂变、商品套图、种草封面——一次上传，生成整套电商商业成片。",
    images: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-hero-workspace.png"],
  },
  alternates: {
    canonical: "https://pixel-diffusion.com",
  },
  robots: {
    index: true,
    follow: true,
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
    <html lang="zh-CN" className={cn("font-sans", geist.variable)} style={{ colorScheme: "light dark", fontSynthesis: "none" }} suppressHydrationWarning>
      <head>
        {/* P1.1 dark-mode bootstrap — runs before paint to avoid FOUC.
            P5.43: home page (/) is always light; never apply `dark` there. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=window.location.pathname;var isHome=p==='/'||p==='/index'||p==='';if(isHome){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';return;}var s=localStorage.getItem('vwg-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
        {/* Preconnect CDN origins for faster image/font/API loading */}
        <link rel="preconnect" href="https://vasthk.oss-cn-hongkong.aliyuncs.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://vasthk.oss-cn-hongkong.aliyuncs.com" />
        <link rel="preconnect" href="https://webstatic.aiproxy.vip" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://webstatic.aiproxy.vip" />
        <link rel="preconnect" href="https://oss.filenest.top" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://oss.filenest.top" />
        <link rel="preconnect" href="https://api.lingyaai.cn" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.lingyaai.cn" />
        <link rel="dns-prefetch" href="https://yunwu.ai" />
      </head>
      <body className="min-h-screen antialiased transition-colors">
        <SentryBootstrap />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-codex-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-codex-accent focus:ring-offset-2"
        >
          跳到主内容
        </a>
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
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
