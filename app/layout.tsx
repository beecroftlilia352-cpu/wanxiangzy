import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
import "./globals.css";
import "./styles/shared-components.css";
import "./styles/studio-primitives.css";
import "./styles/studio.css";
import "./styles/studio-overrides.css";
import "./styles/i18n.css";
import "./styles/artistry.css";
import "./styles/motion.css";
import { HeaderClient } from "@/components/HeaderClient";
import { RouteProgress } from "@/components/ui/route-progress";
import "@/lib/env";
import { Geist, Syne } from "next/font/google";
import { cn } from "@/lib/utils";
import { getSiteMonitoringConfig } from "@/lib/site-config";
import { SentryBootstrap } from "@/components/SentryBootstrap";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  // 多语言字体回退链：CJK / 阿拉伯 / 西里尔 / 泰 / 天城文全部落到系统原生字体
  fallback: [
    "system-ui",
    "arial",
    "PingFang SC",
    "Hiragino Sans",
    "Microsoft YaHei",
    "Noto Sans SC",
    "Noto Sans",
    "Noto Sans Arabic",
    "Noto Sans Thai",
    "Noto Sans Devanagari",
    "sans-serif",
  ],
  adjustFontFallback: false,
});

// 大师级标题字体：Syne（前卫时尚）。正文沿用 Geist（与 Manrope 功能重叠，去掉冗余字体请求）
const syne = Syne({
  subsets: ["latin"],
  weight: "700", // 仅加载标题所需字重，减小字体体积
  variable: "--font-display",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const configured = await getSiteMonitoringConfig().catch(() => null);
  const locale = await getLocale().catch(() => "zh");
  const isZh = locale === "zh";
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: {
      default: configured?.seoTitle || t("title"),
      template: "%s | Pixel Diffusion",
    },
    description: configured?.seoDescription || t("description"),
    keywords: t.raw("keywords"),
    icons: {
      icon: [{ url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
      apple: [{ url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      locale: isZh ? "zh_CN" : "en_US",
      url: "https://pixel-diffusion.com",
      siteName: "Pixel Diffusion",
      title: configured?.seoTitle || t("title"),
      description: configured?.seoDescription || t("ogDescription"),
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
      title: configured?.seoTitle || t("title"),
      description: configured?.seoDescription || t("ogDescription"),
      images: ["https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-hero-workspace.png"],
    },
    alternates: { canonical: "https://pixel-diffusion.com" },
    robots: { index: true, follow: true },
  };
}



export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale().catch(() => "zh");
  const messages = await getMessages();

  const htmlLang = locale === "zh" ? "zh-CN" : locale === "zh-TW" ? "zh-TW" : locale;
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={htmlLang} dir={dir} className={cn("font-sans", geist.variable, syne.variable)} style={{ colorScheme: "light dark", fontSynthesis: "none" }} suppressHydrationWarning>
      <head>
        {/* P1.1 dark-mode bootstrap — runs before paint to avoid FOUC. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('vwg-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
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
        <NextIntlClientProvider messages={messages}>
          <SentryBootstrap />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-codex-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-codex-accent focus:ring-offset-2"
          >
            {messages.Metadata?.skipToContent ?? "跳到主内容"}
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
