"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Gift, Link2, Share2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Empty,
  Progress,
  Table,
  Tag,
  Typography,
  type ColumnsType,
} from "@/components/ui/shadcn-compat";

const { Text } = Typography;

type InviteUsage = {
  id: string;
  email: string;
  rewarded: boolean;
  inviterCredits: number;
  createdAt: string | null;
};

type InviteRules = {
  inviterCredits: number;
  inviteeCredits: number;
};

type InviteInfo = {
  code: string;
  maxUses: number;
  usedCount: number;
  remaining: number;
  rules: InviteRules;
  rewardedCount: number;
  totalRewardCredits: number;
  inviteUrl: string;
  shareText: string;
  usages: InviteUsage[];
};

const PAGE_SIZE = 10;

/**
 * 邀请好友面板：展示专属邀请码、奖励规则与邀请记录。
 * 奖励规则由服务端后台配置下发，前端不做硬编码；文案走 i18n（Invite 命名空间）。
 */
export function InvitePanel() {
  const t = useTranslations("Invite");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invite/me", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || t("loadFailed"));
      setInfo(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  function copyLink() {
    if (!info) return;
    return copyText(info.inviteUrl, t("copyLinkDone"));
  }

  function copyCode() {
    if (!info) return;
    return copyText(info.code, t("copyCodeDone"));
  }

  async function shareLink() {
    if (!info) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Pixel Diffusion",
          text: info.shareText,
          url: info.inviteUrl,
        });
      } catch {
        // 用户取消分享
      }
    } else {
      await copyLink();
    }
  }

  if (loading) {
    return <Card loading className="min-h-[320px]" />;
  }

  if (error || !info) {
    return (
      <div className="rounded-2xl border border-[var(--codex-border)] bg-white p-10 text-center dark:border-white/10 dark:bg-[var(--codex-surface)]">
        <p className="text-sm font-bold text-red-500">{error || t("loadFailed")}</p>
        <Button className="mt-4" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InviteHeroCard info={info} onCopyLink={copyLink} onCopyCode={copyCode} onShare={() => void shareLink()} />
      <InviteStatsRow info={info} />
      <RewardRulesCard info={info} />
      <InviteRecordsCard info={info} page={page} onPageChange={setPage} />
    </div>
  );
}

function InviteHeroCard({
  info,
  onCopyLink,
  onCopyCode,
  onShare,
}: {
  info: InviteInfo;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onShare: () => void;
}) {
  const t = useTranslations("Invite");
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#23273d] via-[#3a4cbb] to-[#7b8cff] px-7 py-6 text-white shadow-lg shadow-[rgba(59,76,187,0.28)]">
      <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-[#aab8ff]/20 blur-2xl" />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#cdd6ff]" aria-hidden="true" />
            <p className="text-lg font-semibold">{t("heroTitle")}</p>
          </div>
          <p className="mt-1 text-sm text-white/75">
            {t("heroDesc", { inviter: info.rules.inviterCredits, invitee: info.rules.inviteeCredits })}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              className="select-all rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 font-mono text-lg font-black tracking-[0.2em]"
              title="Invite code"
            >
              {info.code}
            </span>
            <span className="hidden text-xs text-white/60 sm:block">{t("heroHint")}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onCopyLink}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-5 text-sm font-bold text-[#2c3aa0] shadow transition hover:bg-[#eef1ff]"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {t("copyLink")}
          </button>
          <button
            type="button"
            onClick={onCopyCode}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/40 bg-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/20"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {t("copyCode")}
          </button>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/40 bg-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/20"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t("share")}
          </button>
        </div>
      </div>
    </section>
  );
}

function InviteStatsRow({ info }: { info: InviteInfo }) {
  const t = useTranslations("Invite");
  const stats = [
    { label: t("statInvited"), value: t("unitPeople", { count: formatNumber(info.usedCount) }) },
    { label: t("statRewarded"), value: t("unitCredits", { count: formatNumber(info.totalRewardCredits) }) },
    { label: t("statRemaining"), value: t("unitPeople", { count: formatNumber(info.remaining) }) },
    { label: t("statPerInvite"), value: t("unitCredits", { count: formatNumber(info.rules.inviterCredits) }) },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-md border border-[var(--codex-border)] bg-white px-4 py-3 dark:border-white/10 dark:bg-[var(--codex-surface)]">
          <p className="text-xs text-codex-muted">{stat.label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-codex-ink">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function RewardRulesCard({ info }: { info: InviteInfo }) {
  const t = useTranslations("Invite");
  const steps = [t("step1"), t("step2"), t("step3")];
  const usedPercent = info.maxUses > 0 ? Math.round((info.usedCount / info.maxUses) * 100) : 0;

  return (
    <Card
      title={
        <div className="py-1">
          <div className="text-lg font-medium">{t("rulesTitle")}</div>
          <div className="mt-1 text-sm font-normal text-codex-muted">{t("rulesDesc")}</div>
        </div>
      }
      className="border-[var(--codex-border)]"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-[#f3f6ff] px-4 py-3.5 dark:bg-codex-surface">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#5b7cff] shadow-sm dark:bg-[var(--codex-surface-strong)]">
              <Gift className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">
                {t("rulesInviter")}{" "}
                <span className="font-bold text-[#5b7cff]">{t("unitCredits", { count: formatNumber(info.rules.inviterCredits) })}</span>
              </p>
              <p className="mt-1 text-sm text-codex-muted">{t("rulesInviterNote")}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-[#f0f7f3] px-4 py-3.5 dark:bg-codex-surface">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm dark:bg-[var(--codex-surface-strong)]">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">
                {t("rulesInvitee")}{" "}
                <span className="font-bold text-emerald-600">{t("unitCredits", { count: formatNumber(info.rules.inviteeCredits) })}</span>
              </p>
              <p className="mt-1 text-sm text-codex-muted">{t("rulesInviteeNote")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm text-codex-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef1ff] text-xs font-bold text-[#5b7cff] dark:bg-[var(--codex-surface-strong)]">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-codex-muted">
              <span>{t("progressLabel")}</span>
              <span className="tabular-nums">
                {formatNumber(info.usedCount)} / {formatNumber(info.maxUses)}
              </span>
            </div>
            <Progress percent={usedPercent} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function InviteRecordsCard({
  info,
  page,
  onPageChange,
}: {
  info: InviteInfo;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("Invite");
  const columns = useMemo<ColumnsType<InviteUsage>>(
    () => [
      {
        title: t("colEmail"),
        dataIndex: "email",
        ellipsis: true,
        render: (value: string) => <span className="font-medium">{value || "-"}</span>,
      },
      { title: t("colTime"), dataIndex: "createdAt", width: 180, render: formatDateTime },
      {
        title: t("colStatus"),
        width: 110,
        render: (_, usage) => (usage.rewarded ? <Tag color="blue">{t("statusRewarded")}</Tag> : <Tag>{t("statusRegistered")}</Tag>),
      },
      {
        title: t("colReward"),
        width: 120,
        align: "center",
        render: (_, usage) =>
          usage.rewarded && usage.inviterCredits > 0 ? (
            <span className="font-semibold text-emerald-600">+{formatNumber(usage.inviterCredits)}</span>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
    ],
    [t],
  );

  const pagedUsages = info.usages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card
      title={
        <div className="py-1">
          <div className="text-lg font-medium">{t("recordsTitle")}</div>
          <div className="mt-1 text-sm font-normal text-codex-muted">
            {t("recordsDesc", { total: formatNumber(info.usages.length), rewarded: formatNumber(info.rewardedCount) })}
          </div>
        </div>
      }
      className="border-[var(--codex-border)]"
    >
      <Table<InviteUsage>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={pagedUsages}
        pagination={
          info.usages.length > PAGE_SIZE
            ? {
                current: page,
                pageSize: PAGE_SIZE,
                total: info.usages.length,
                showTotal: (total, range) => `${total} · ${range[0]}-${range[1]}`,
                onChange: onPageChange,
              }
            : false
        }
        locale={{ emptyText: <Empty description={t("emptyRecords")} /> }}
      />
    </Card>
  );
}

/** 数字/日期按当前语言本地化（html lang 与 next-intl locale 同步） */
function getDocumentLocale() {
  if (typeof document === "undefined") return "zh";
  const lang = document.documentElement.lang || "zh";
  return lang === "zh-CN" ? "zh" : lang;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(getDocumentLocale()).format(Number(value || 0));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date
    .toLocaleString(getDocumentLocale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(/\//g, "-");
}
