"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { LOGIN_SHOWCASE_IMAGES } from "@/features/login/auth-views";

/**
 * 登录页左侧营销 hero：品牌徽标 + 大标题 + 描述 + 4 列 showcase。
 *
 * 纯展示组件，无 props，无状态。仅在 lg 断点以上显示。
 */
export function AuthHero() {
  const t = useTranslations("Login");
  return (
    <section className="hidden lg:block" aria-hidden="true">
      <div className="studio-surface studio-surface-elevated relative overflow-hidden rounded-[34px] p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,var(--codex-accent-18),transparent_34%),radial-gradient(circle_at_86%_8%,rgba(174, 184, 255, 0.28),transparent_38%)]" />
        <div className="relative z-10">
          <Link href="/" className="studio-button studio-button-compact">
            <CheckCircle aria-hidden="true" className="h-4 w-4 text-[var(--codex-accent)]" />
            Pixel Diffusion
          </Link>
          <h1 className="mt-10 max-w-xl text-5xl font-black leading-[0.95] tracking-[-0.04em] text-codex-ink">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-codex-muted">
            {t("heroDesc")}
          </p>

          <div className="mt-10 grid grid-cols-4 gap-3" aria-hidden="true">
            {LOGIN_SHOWCASE_IMAGES.map((src, index) => (
              <div
                key={src}
                className={`relative aspect-[3/4] overflow-hidden rounded-3xl bg-[var(--codex-ice)] shadow-[0_18px_48px_rgba(14,18,38,0.14)] ${
                  index % 2 === 1 ? "translate-y-8" : ""
                }`}
              >
                <Image src={src} alt="" fill sizes="180px" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}