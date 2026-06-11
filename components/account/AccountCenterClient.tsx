"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Coins,
  CreditCard,
  LifeBuoy,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";

type AccountTab = "account" | "credits" | "orders" | "help" | "messages" | "feedback";

type ProfilePayload = {
  user?: { id?: string | null; email?: string | null } | null;
  profile?: { displayName?: string | null; createdAt?: string | null; updatedAt?: string | null } | null;
  credits?: number | null;
  totalCreditsUsed?: number | null;
};

type CreditLog = {
  id: string;
  amount: number;
  balance: number;
  reason: string | null;
  generation_id: string | null;
  created_at: string;
};

type BillingOrder = {
  id: string;
  productName: string;
  priceLabel: string;
  mode: string;
  status: string;
  currency: string;
  amountTotal: number;
  amountRefunded: number;
  creditsExpected: number;
  creditsGranted: number;
  creditGrantStatus: string;
  createdAt: string;
  updatedAt: string;
};

type SupportTicket = {
  id: string;
  ticketNo: string;
  status: string;
  priority: string;
  category: string;
  categoryLabel: string;
  title: string;
  description: string;
  resolution: string;
  createdAt: string;
  updatedAt: string;
};

type FeedbackForm = {
  category: string;
  title: string;
  description: string;
  contact: string;
};

const tabs: { key: AccountTab; label: string; description: string; icon: typeof UserRound }[] = [
  { key: "account", label: "账户信息", description: "登录资料与账户状态", icon: UserRound },
  { key: "credits", label: "积分明细", description: "扣费、退款和余额变化", icon: Coins },
  { key: "orders", label: "充值记录", description: "Stripe 支付和到账记录", icon: CreditCard },
  { key: "help", label: "帮助中心", description: "常见问题与测试指引", icon: CircleHelp },
  { key: "messages", label: "消息中心", description: "订单和服务通知", icon: Bell },
  { key: "feedback", label: "客服反馈", description: "提交问题给运营后台", icon: MessageSquare },
];

const feedbackCategories = [
  { value: "billing", label: "充值支付" },
  { value: "credit_issue", label: "积分异常" },
  { value: "generation_failure", label: "生成问题" },
  { value: "account", label: "账户问题" },
  { value: "technical", label: "功能异常" },
  { value: "other", label: "其他建议" },
];

const helpItems = [
  {
    title: "充值后没有到账怎么办？",
    body: "微信、支付宝等异步支付以 Stripe webhook 为准。支付完成后通常会在几秒内入账，若页面没有自动刷新，可到充值记录查看订单状态。",
  },
  {
    title: "积分为什么会被扣除？",
    body: "确认生成后系统会预扣积分；任务失败或取消会自动退回。积分明细会记录每次扣费、退款和人工补偿。",
  },
  {
    title: "如何联系客服？",
    body: "在客服反馈里选择类型并描述问题，后台会生成工单。充值和积分问题会自动提升优先级，便于客服优先处理。",
  },
  {
    title: "如何查看历史作品？",
    body: "顶部导航的“我的作品”会进入历史记录；个人中心会保留账户、积分和订单的运营视角。",
  },
];

const emptyProfile: ProfilePayload = {
  user: null,
  profile: null,
  credits: 0,
  totalCreditsUsed: 0,
};

export function AccountCenterClient() {
  const [activeTab, setActiveTab] = useState<AccountTab>("account");
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfile);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackForm>({
    category: "billing",
    title: "",
    description: "",
    contact: "",
  });
  const [feedbackStatus, setFeedbackStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (isAccountTab(tab)) setActiveTab(tab);
    void loadAll();
  }, []);

  const latestBalance = profile.credits ?? creditLogs[0]?.balance ?? 0;
  const paidOrders = useMemo(() => orders.filter((order) => order.status === "paid"), [orders]);
  const totalPaidAmount = paidOrders.reduce((sum, order) => sum + Math.max(0, order.amountTotal - order.amountRefunded), 0);
  const totalGrantedCredits = paidOrders.reduce((sum, order) => sum + Math.max(0, order.creditsGranted), 0);
  const openTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const displayName = profile.profile?.displayName || profile.user?.email?.split("@")[0] || "VastWearGen 用户";
  const shortUserId = profile.user?.id ? profile.user.id.slice(0, 8) : "--";

  async function loadAll(options: { silent?: boolean } = {}) {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [profileResult, logsResult, ordersResult, ticketsResult] = await Promise.allSettled([
        fetchJson<ProfilePayload>("/api/profile"),
        fetchJson<{ logs?: CreditLog[] }>("/api/credits/logs"),
        fetchJson<{ orders?: BillingOrder[] }>("/api/billing/orders"),
        fetchJson<{ tickets?: SupportTicket[] }>("/api/support/feedback"),
      ]);

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
      } else if (profileResult.reason?.status === 401) {
        window.location.replace("/login?next=/account");
        return;
      } else {
        throw profileResult.reason;
      }

      if (logsResult.status === "fulfilled") setCreditLogs(Array.isArray(logsResult.value.logs) ? logsResult.value.logs : []);
      if (ordersResult.status === "fulfilled") setOrders(Array.isArray(ordersResult.value.orders) ? ordersResult.value.orders : []);
      if (ticketsResult.status === "fulfilled") setTickets(Array.isArray(ticketsResult.value.tickets) ? ticketsResult.value.tickets : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "个人中心加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function selectTab(tab: AccountTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingFeedback(true);
    setFeedbackStatus(null);
    try {
      const payload = {
        ...feedback,
        pageUrl: window.location.href,
      };
      const response = await fetch("/api/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "反馈提交失败");
      setFeedback({ category: feedback.category, title: "", description: "", contact: "" });
      setFeedbackStatus({ type: "success", text: `已提交，工单号 ${data.ticket?.ticketNo || ""}`.trim() });
      const ticketsPayload = await fetchJson<{ tickets?: SupportTicket[] }>("/api/support/feedback");
      setTickets(Array.isArray(ticketsPayload.tickets) ? ticketsPayload.tickets : []);
    } catch (err) {
      setFeedbackStatus({ type: "error", text: err instanceof Error ? err.message : "反馈提交失败" });
    } finally {
      setSubmittingFeedback(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef4ff_0%,#f8fbff_44%,#ffffff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl gap-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 rounded-[28px] border border-white/80 bg-white/80 p-3 shadow-xl shadow-slate-200/50 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-3 rounded-3xl bg-slate-950 px-4 py-4 text-white">
              <Avatar name={displayName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{displayName}</p>
                <p className="mt-0.5 text-xs text-white/60">ID {shortUserId}</p>
              </div>
            </div>
            <nav className="space-y-1" aria-label="个人中心模块">
              {tabs.map((tab) => (
                <TabButton key={tab.key} tab={tab} active={activeTab === tab.key} onClick={() => selectTab(tab.key)} />
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-5 flex flex-col gap-3 lg:hidden">
            <div className="flex items-center gap-3">
              <Avatar name={displayName} />
              <div>
                <p className="text-sm font-black text-slate-950">{displayName}</p>
                <p className="text-xs text-slate-500">个人中心</p>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => selectTab(tab.key)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${
                    activeTab === tab.key ? "bg-slate-950 text-white" : "border border-white/80 bg-white/82 text-slate-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <AccountHero
            displayName={displayName}
            email={profile.user?.email || ""}
            credits={latestBalance}
            totalPaidAmount={totalPaidAmount}
            totalGrantedCredits={totalGrantedCredits}
            openTickets={openTickets}
            loading={loading}
            refreshing={refreshing}
            onRefresh={() => void loadAll({ silent: true })}
          />

          {error && (
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="mt-6">
            {loading ? (
              <AccountSkeleton />
            ) : (
              <>
                {activeTab === "account" && <AccountInfo profile={profile} orders={orders} openTickets={openTickets} />}
                {activeTab === "credits" && <CreditLogsPanel logs={creditLogs} />}
                {activeTab === "orders" && <OrdersPanel orders={orders} />}
                {activeTab === "help" && <HelpPanel />}
                {activeTab === "messages" && <MessagesPanel orders={orders} tickets={tickets} />}
                {activeTab === "feedback" && (
                  <FeedbackPanel
                    form={feedback}
                    status={feedbackStatus}
                    tickets={tickets}
                    submitting={submittingFeedback}
                    onChange={setFeedback}
                    onSubmit={submitFeedback}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AccountHero({
  displayName,
  email,
  credits,
  totalPaidAmount,
  totalGrantedCredits,
  openTickets,
  loading,
  refreshing,
  onRefresh,
}: {
  displayName: string;
  email: string;
  credits: number;
  totalPaidAmount: number;
  totalGrantedCredits: number;
  openTickets: number;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[32px] border border-white/80 bg-white/82 shadow-xl shadow-slate-200/50 backdrop-blur-xl">
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px] lg:p-7">
        <div className="relative min-h-[210px] overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#f8fbff_0%,#dbe8ff_52%,#aeb8ff_100%)] p-5">
          <div className="absolute right-8 top-6 h-24 w-24 rounded-full border border-white/60 bg-white/40 blur-sm" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Personal Center</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">个人中心</h1>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">
                管理账户、积分、充值记录、消息和客服反馈。常用入口已经放在头像弹层里，日常操作少走弯路。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill icon={ShieldCheck} label={email || displayName} />
              <StatusPill icon={Sparkles} label="免费版" />
              <StatusPill icon={LifeBuoy} label={openTickets ? `${openTickets} 个处理中反馈` : "客服在线"} />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[28px] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-300/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-white/50">Credits Wallet</p>
              <p className="mt-3 text-4xl font-black">{loading ? "--" : formatNumber(credits)}</p>
              <p className="mt-1 text-sm font-semibold text-white/60">当前可用积分</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <WalletCards className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <MetricMini label="累计充值" value={formatCny(totalPaidAmount)} />
            <MetricMini label="到账积分" value={formatNumber(totalGrantedCredits)} />
          </div>
          <div className="mt-5 flex gap-2">
            <Link
              href="/pricing"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#f5ff38_0%,#dbe8ff_100%)] px-4 text-sm font-black text-slate-950 shadow-lg shadow-lime-200/30 transition hover:brightness-105"
            >
              <CreditCard className="h-4 w-4" />
              充值中心
            </Link>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16 disabled:opacity-60"
              aria-label="刷新个人中心"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountInfo({ profile, orders, openTickets }: { profile: ProfilePayload; orders: BillingOrder[]; openTickets: number }) {
  const paidOrders = orders.filter((order) => order.status === "paid").length;
  return (
    <Panel title="账户信息" description="登录资料、账户资产和服务状态集中在这里。">
      <div className="grid gap-3 md:grid-cols-2">
        <InfoRow label="用户 ID" value={profile.user?.id || "-"} />
        <InfoRow label="邮箱" value={profile.user?.email || "未绑定"} />
        <InfoRow label="用户名" value={profile.profile?.displayName || "未设置"} />
        <InfoRow label="注册时间" value={formatDate(profile.profile?.createdAt)} />
        <InfoRow label="当前积分" value={`${formatNumber(profile.credits ?? 0)} 积分`} />
        <InfoRow label="累计消耗" value={`${formatNumber(profile.totalCreditsUsed ?? 0)} 积分`} />
        <InfoRow label="已支付订单" value={`${paidOrders} 笔`} />
        <InfoRow label="客服状态" value={openTickets ? `${openTickets} 个处理中` : "暂无待处理反馈"} />
      </div>
    </Panel>
  );
}

function CreditLogsPanel({ logs }: { logs: CreditLog[] }) {
  const income = logs.filter((log) => log.amount > 0).reduce((sum, log) => sum + log.amount, 0);
  const spend = Math.abs(logs.filter((log) => log.amount < 0).reduce((sum, log) => sum + log.amount, 0));

  return (
    <Panel title="积分明细" description="扣费、失败退款、充值入账和人工调整都会出现在这里。">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard label="最近收入" value={`+${formatNumber(income)}`} tone="green" />
        <MetricCard label="最近支出" value={`-${formatNumber(spend)}`} tone="blue" />
        <MetricCard label="记录条数" value={`${logs.length}`} tone="slate" />
      </div>
      {logs.length ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <CreditLogItem key={log.id} log={log} />
          ))}
        </div>
      ) : (
        <EmptyState title="暂无积分明细" description="完成充值、生成或退款后，这里会显示余额变化。" actionHref="/pricing" actionText="前往充值中心" />
      )}
    </Panel>
  );
}

function OrdersPanel({ orders }: { orders: BillingOrder[] }) {
  return (
    <Panel title="充值记录" description="这里记录 Stripe 支付状态、到账积分和退款状态。">
      {orders.length ? (
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500 md:grid">
            <span>套餐</span>
            <span>金额</span>
            <span>到账</span>
            <span>状态</span>
            <span>时间</span>
          </div>
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="暂无充值记录" description="你还没有购买过套餐。充值成功后，订单会同步到这里。" actionHref="/pricing" actionText="进入充值中心" />
      )}
    </Panel>
  );
}

function HelpPanel() {
  return (
    <Panel title="帮助中心" description="高频问题放在前面，遇到具体订单问题可直接提交反馈。">
      <div className="grid gap-3 md:grid-cols-2">
        {helpItems.map((item) => (
          <article key={item.title} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]">
              <CircleHelp className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-black text-slate-950">{item.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.body}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function MessagesPanel({ orders, tickets }: { orders: BillingOrder[]; tickets: SupportTicket[] }) {
  const messages = [
    ...orders.slice(0, 6).map((order) => ({
      id: `order-${order.id}`,
      title: order.status === "paid" ? "充值已完成" : "充值订单状态更新",
      body: `${order.productName} · ${formatCny(order.amountTotal)} · ${statusLabel(order.status)}`,
      time: order.updatedAt || order.createdAt,
      icon: order.status === "paid" ? CheckCircle2 : Clock3,
    })),
    ...tickets.slice(0, 6).map((ticket) => ({
      id: `ticket-${ticket.id}`,
      title: `客服工单 ${ticket.ticketNo || ""}`.trim(),
      body: `${ticket.categoryLabel} · ${ticketStatusLabel(ticket.status)}`,
      time: ticket.updatedAt || ticket.createdAt,
      icon: MessageSquare,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <Panel title="消息中心" description="订单、充值和客服反馈的关键通知会聚合在这里。">
      {messages.length ? (
        <div className="space-y-2">
          {messages.map((message) => {
            const Icon = message.icon;
            return (
              <div key={message.id} className="flex gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-950">{message.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{message.body}</p>
                  <p className="mt-2 text-xs font-bold text-slate-400">{formatDateTime(message.time)}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="暂无消息" description="订单状态和客服反馈进度会在这里出现。" />
      )}
    </Panel>
  );
}

function FeedbackPanel({
  form,
  status,
  tickets,
  submitting,
  onChange,
  onSubmit,
}: {
  form: FeedbackForm;
  status: { type: "success" | "error"; text: string } | null;
  tickets: SupportTicket[];
  submitting: boolean;
  onChange: (value: FeedbackForm) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Panel title="客服反馈" description="充值、积分、生成和账户问题都可以提交，后台会生成工单。">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black text-slate-500">反馈类型</span>
              <select
                value={form.category}
                onChange={(event) => onChange({ ...form, category: event.target.value })}
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[var(--codex-accent)] focus:ring-4 focus:ring-[rgba(91,124,255,0.12)]"
              >
                {feedbackCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black text-slate-500">联系方式</span>
              <input
                value={form.contact}
                onChange={(event) => onChange({ ...form, contact: event.target.value })}
                placeholder="邮箱 / 微信 / 手机号"
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[var(--codex-accent)] focus:ring-4 focus:ring-[rgba(91,124,255,0.12)]"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-black text-slate-500">标题</span>
            <input
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
              placeholder="例如：微信支付成功但积分未到账"
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[var(--codex-accent)] focus:ring-4 focus:ring-[rgba(91,124,255,0.12)]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-slate-500">问题描述</span>
            <textarea
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
              placeholder="请描述发生时间、操作页面、订单或任务信息。"
              rows={6}
              className="mt-2 w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-800 outline-none transition focus:border-[var(--codex-accent)] focus:ring-4 focus:ring-[rgba(91,124,255,0.12)]"
              required
            />
          </label>
          {status && (
            <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${status.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {status.text}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-300/50 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            提交反馈
          </button>
        </form>
      </Panel>
      <Panel title="反馈记录" description="最近提交的工单会显示处理状态。">
        {tickets.length ? (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
        ) : (
          <EmptyState title="暂无反馈记录" description="提交后会自动生成工单，后台可跟进处理。" />
        )}
      </Panel>
    </div>
  );
}

function TabButton({ tab, active, onClick }: { tab: (typeof tabs)[number]; active: boolean; onClick: () => void }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
        active
          ? "bg-[linear-gradient(135deg,#f5ff38_0%,#dbe8ff_100%)] text-slate-950 shadow-sm"
          : "text-slate-600 hover:bg-white hover:text-slate-950"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-black">{tab.label}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-70">{tab.description}</span>
      </span>
    </button>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-xl shadow-slate-200/45 backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white px-4 py-4 shadow-sm shadow-slate-200/35">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-black text-slate-950">{value || "-"}</p>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-3">
      <p className="text-[11px] font-bold text-white/50">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "green" | "blue" | "slate" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className={`rounded-3xl px-4 py-4 ${colors[tone]}`}>
      <p className="text-xs font-black opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function CreditLogItem({ log }: { log: CreditLog }) {
  const positive = log.amount > 0;
  return (
    <div className="flex gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${positive ? "bg-emerald-50 text-emerald-600" : "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]"}`}>
        {positive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{log.reason || "积分变动"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {formatDateTime(log.created_at)}{log.generation_id ? ` · 任务 ${log.generation_id.slice(0, 8)}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-base font-black ${positive ? "text-emerald-600" : "text-[var(--codex-accent)]"}`}>
              {positive ? "+" : ""}{formatNumber(log.amount)}
            </p>
            <p className="text-xs font-bold text-slate-400">余额 {formatNumber(log.balance)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: BillingOrder }) {
  return (
    <div className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-black text-slate-950">{order.productName}</p>
        <p className="mt-0.5 text-xs font-semibold text-slate-400">{order.priceLabel || (order.mode === "subscription" ? "订阅" : "一次性购买")}</p>
      </div>
      <p className="font-black text-slate-800">{formatCny(order.amountTotal)}</p>
      <p className="font-black text-[var(--codex-accent)]">{formatNumber(order.creditsGranted || order.creditsExpected)} 积分</p>
      <p><StatusBadge label={statusLabel(order.status)} tone={order.status === "paid" ? "green" : order.status.includes("refund") ? "amber" : "slate"} /></p>
      <p className="text-xs font-bold text-slate-400">{formatDateTime(order.createdAt)}</p>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{ticket.title}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">{ticket.ticketNo || ticket.categoryLabel} · {formatDateTime(ticket.createdAt)}</p>
        </div>
        <StatusBadge label={ticketStatusLabel(ticket.status)} tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : "amber"} />
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{ticket.description}</p>
    </div>
  );
}

function EmptyState({ title, description, actionHref, actionText }: { title: string; description: string; actionHref?: string; actionText?: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-12 text-center">
      <p className="text-base font-black text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">{description}</p>
      {actionHref && actionText && (
        <Link href={actionHref} className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
          {actionText}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-xl shadow-slate-200/45">
      <div className="h-6 w-36 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-3xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "V";
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f5ff38_0%,#aeb8ff_100%)] text-base font-black text-slate-950 shadow-sm">
      {initial}
    </div>
  );
}

function StatusPill({ icon: Icon, label }: { icon: typeof UserRound; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-xs font-black text-slate-700">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "green" | "amber" | "slate" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${colors[tone]}`}>{label}</span>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "请求失败") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

function isAccountTab(value: unknown): value is AccountTab {
  return typeof value === "string" && tabs.some((tab) => tab.key === value);
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatCny(value: number) {
  return `¥${(Number(value || 0) / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    checkout_created: "待支付",
    checkout_open: "待支付",
    pending: "处理中",
    paid: "已支付",
    failed: "失败",
    cancelled: "已取消",
    refunded: "已退款",
    partially_refunded: "部分退款",
  };
  return labels[status] || status || "未知";
}

function ticketStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "待处理",
    pending: "处理中",
    waiting_user: "等待补充",
    resolved: "已解决",
    closed: "已关闭",
  };
  return labels[status] || status || "未知";
}
