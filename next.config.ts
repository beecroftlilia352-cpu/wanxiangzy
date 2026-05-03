import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "**.fashn.ai" },
      { protocol: "https", hostname: "**.sssai.vip" },
      { protocol: "https", hostname: "i.ibb.co" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://*.supabase.co https://replicate.delivery https://*.fashn.ai https://*.sssai.vip https://i.ibb.co https://*.ibb.co",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co https://api.lingyaai.cn https://api.bltcy.ai https://api.xiaomimimo.com https://api.imgbb.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
