import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Coffee, Coins, Github, HeartHandshake, Mail, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Support — 请我喝咖啡",
  description:
    "Support Pixel Diffusion maintenance: WeChat Pay, crypto (Tron), GitHub Sponsors, and contribution options. 支持 Pixel Diffusion 的持续维护。",
};

const cardClass =
  "rounded-3xl border border-[var(--codex-border)] bg-codex-card p-8 shadow-sm";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-codex-surface text-codex-ink">
      <div className="mx-auto max-w-[1080px] px-5 py-16 sm:px-8 sm:py-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--codex-border)] bg-codex-card px-4 py-1.5 text-[13px] font-semibold text-codex-muted">
          <Coffee aria-hidden="true" className="h-4 w-4" />
          Support · 支持
        </p>
        <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
          请我喝杯咖啡
          <span className="mt-2 block text-xl font-semibold text-codex-muted sm:text-2xl">
            Buy me a coffee if Pixel Diffusion helps you
          </span>
        </h1>
        <p className="mt-6 max-w-[640px] text-[15px] leading-8 text-codex-muted">
          如果这个项目帮你省了时间，欢迎用一杯咖啡支持持续维护。赞助不会改变
          Apache-2.0 许可证，也不会购买项目控制权或功能承诺。
          <span className="mt-2 block">
            If this project saves you time, consider supporting maintenance with
            a coffee. Sponsorship does not change the Apache-2.0 license and
            does not buy project control or feature commitments.
          </span>
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <section className={cardClass} aria-labelledby="support-wechat">
            <h2
              id="support-wechat"
              className="text-lg font-bold"
            >
              微信支付 · WeChat Pay
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-codex-muted">
              打开微信扫一扫。国内用户最方便的赞助方式。
              <span className="block">
                Scan with WeChat. The easiest option for users in China.
              </span>
            </p>
            <div className="mt-6 flex justify-center">
              <Image
                src="/images/sponsor-wechat-qr.png"
                alt="WeChat Pay support QR code · 微信支付赞助二维码"
                width={240}
                height={323}
                className="h-auto w-[240px] rounded-2xl border border-[var(--codex-border)] bg-white p-2 shadow-sm"
                priority
              />
            </div>
            <p className="mt-4 text-center text-[13px] text-codex-faint">
              二维码只用于自愿赞助，请确认页面域名为 pixel-diffusion.com
            </p>
          </section>

          <section className={cardClass} aria-labelledby="support-crypto">
            <h2
              id="support-crypto"
              className="flex items-center gap-2 text-lg font-bold"
            >
              <Coins aria-hidden="true" className="h-5 w-5" />
              数字货币 · Crypto
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-codex-muted">
              仅支持 Tron 网络资产（TRC10/TRC20，如 USDT、TRX）。转错网络无法找回。
              <span className="block">
                Tron network only (TRC10/TRC20, e.g. USDT, TRX). Wrong-network
                transfers cannot be recovered.
              </span>
            </p>
            <div className="mt-6 flex justify-center">
              <Image
                src="/images/sponsor-tron-qr.png"
                alt="Tron wallet QR code · Tron 钱包收款二维码"
                width={240}
                height={399}
                className="h-auto w-[240px] rounded-2xl border border-[var(--codex-border)] bg-white p-2 shadow-sm"
                loading="lazy"
              />
            </div>
            <p className="mt-4 text-center">
              <code className="break-all text-[12px] font-semibold text-codex-ink">
                TDLDHdAhwJ8RuntRyNAv4nnStUiR632CVW
              </code>
            </p>
            <p className="mt-3 text-center text-[13px] leading-6 text-codex-faint">
              发送前请核对：以 TDLD 开头、CVW 结尾。链上转账不可撤销。
            </p>
          </section>

          <section className={cardClass} aria-labelledby="support-github">
            <h2
              id="support-github"
              className="flex items-center gap-2 text-lg font-bold"
            >
              <Github aria-hidden="true" className="h-5 w-5" />
              GitHub Sponsors
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-codex-muted">
              支持月付 / 一次性赞助，可审计、可退款，仓库页会显示 Sponsor
              按钮。适合国际用户和企业赞助。
              <span className="block">
                Monthly or one-time, auditable and refundable. Best for
                international and corporate sponsors.
              </span>
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <a
                href="https://github.com/sponsors/ganjmeng"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-codex-ink px-5 text-[14px] font-semibold text-white transition hover:opacity-90"
              >
                <HeartHandshake aria-hidden="true" className="h-4 w-4" />
                前往 GitHub Sponsors
              </a>
              <Link
                href="https://github.com/ganjmeng/wanxiangzy"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[var(--codex-border)] px-5 text-[14px] font-semibold transition hover:shadow-md"
              >
                查看开源仓库
              </Link>
            </div>
            <p className="mt-6 flex items-start gap-2 text-[13px] leading-6 text-codex-faint">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              需要发票或企业支持？先提一个 Issue 说明需求，我们再对接。
            </p>
          </section>
        </div>

        <section
          className={`${cardClass} mt-6`}
          aria-labelledby="support-contact"
        >
          <h2
            id="support-contact"
            className="flex items-center gap-2 text-lg font-bold"
          >
            <Mail aria-hidden="true" className="h-5 w-5" />
            联系作者 · Contact
          </h2>
          <p className="mt-3 text-[14px] leading-7 text-codex-muted">
            商务合作、发票、企业支持，或赞助后需要确认，请发邮件。发送时请注明你的
            GitHub 用户名或交易哈希，方便对账。
            <span className="mt-1 block">
              For partnerships, invoices, enterprise support, or sponsorship
              confirmation, email with your GitHub username or transaction hash.
            </span>
          </p>
          <div className="mt-5">
            <a
              href="mailto:178153955@qq.com"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--codex-border)] px-5 text-[14px] font-semibold transition hover:shadow-md"
            >
              <Mail aria-hidden="true" className="h-4 w-4" />
              178153955@qq.com
            </a>
          </div>
        </section>

        <section
          className={`${cardClass} mt-6`}
          aria-labelledby="support-contribute"
        >
          <h2 id="support-contribute" className="text-lg font-bold">
            非金钱支持同样珍贵 · Non-financial support matters
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-7 text-codex-muted">
            <li>
              提交高质量 PR：问题修复、聚焦测试、文档、可访问性改进，见{" "}
              <Link
                href="https://github.com/ganjmeng/wanxiangzy/blob/main/CONTRIBUTING.md"
                className="font-semibold text-codex-ink underline underline-offset-4"
              >
                CONTRIBUTING.md
              </Link>
            </li>
            <li>
              报告可复现的 Bug，附最小复现步骤和已脱敏日志
            </li>
            <li>分享你的成片案例和使用经验，帮助改进文档</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
