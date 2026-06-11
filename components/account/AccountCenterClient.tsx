"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Children, isValidElement, useEffect, useMemo, useState, type ReactElement } from "react";
import { Alert, Avatar as AntAvatar, Button, Card, ConfigProvider, Empty, Input, Progress, Select, Space, Statistic, Table, Tag, theme as antdTheme, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import zhCN from "antd/locale/zh_CN";
import {
  AlertCircle,
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Coins,
  CreditCard,
  ImageIcon,
  LifeBuoy,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const { Text, Title } = Typography;

type AccountTab = "account" | "credits" | "orders" | "help" | "messages" | "feedback";
type CreditDirection = "all" | "income" | "spend";
type CreditType = "all" | "recharge" | "generation" | "refund" | "manual" | "compensation" | "other";
type CreditSort = "newest" | "oldest" | "amount_desc" | "amount_asc";
type OrderStatus = "all" | "pending" | "processing" | "paid" | "failed" | "canceled" | "refunded" | "partially_refunded";
type OrderGrantStatus = "all" | "pending" | "granted" | "failed" | "skipped" | "refunded" | "reversed" | "partial";
type OrderMode = "all" | "payment" | "subscription";
type OrderSort = "newest" | "oldest" | "amount_desc" | "amount_asc" | "credits_desc" | "updated_desc";

type ProfilePayload = {
  user?: { id?: string | null; email?: string | null } | null;
  profile?: { displayName?: string | null; createdAt?: string | null; updatedAt?: string | null } | null;
  credits?: number | null;
  totalCreditsUsed?: number | null;
};

type PageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
};

type CreditLog = {
  id: string;
  amount: number;
  balance: number;
  reason: string | null;
  generation_id: string | null;
  created_at: string;
  type?: CreditType;
};

type CreditSummary = {
  pageIncome: number;
  pageSpend: number;
  count: number;
};

type BillingOrder = {
  id: string;
  productId?: string;
  productName: string;
  priceId?: string;
  priceLabel: string;
  mode: string;
  status: string;
  currency: string;
  amountTotal: number;
  amountRefunded: number;
  amountNet?: number;
  creditsExpected: number;
  creditsGranted: number;
  creditGrantStatus: string;
  checkoutSessionId?: string;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
};

type OrderSummary = {
  pageNetAmount: number;
  pageGrantedCredits: number;
  count: number;
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

type CreditFilters = {
  direction: CreditDirection;
  type: CreditType;
  q: string;
  from: string;
  to: string;
  sort: CreditSort;
};

type OrderFilters = {
  status: OrderStatus;
  creditGrantStatus: OrderGrantStatus;
  mode: OrderMode;
  q: string;
  from: string;
  to: string;
  sort: OrderSort;
};

const tabs: { key: AccountTab; label: string; description: string; icon: LucideIcon }[] = [
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

const creditTypeOptions: { value: CreditType; label: string }[] = [
  { value: "all", label: "全部类型" },
  { value: "recharge", label: "充值到账" },
  { value: "generation", label: "生成扣费" },
  { value: "refund", label: "退款/退回" },
  { value: "manual", label: "人工调整" },
  { value: "compensation", label: "系统补偿" },
  { value: "other", label: "其他" },
];

const orderStatusOptions: { value: OrderStatus; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待支付" },
  { value: "processing", label: "处理中" },
  { value: "paid", label: "已支付" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
  { value: "refunded", label: "已退款" },
  { value: "partially_refunded", label: "部分退款" },
];

const orderGrantStatusOptions: { value: OrderGrantStatus; label: string }[] = [
  { value: "all", label: "全部到账" },
  { value: "pending", label: "入账中" },
  { value: "granted", label: "已到账" },
  { value: "failed", label: "入账失败" },
  { value: "skipped", label: "无需到账" },
  { value: "refunded", label: "已退款" },
  { value: "reversed", label: "已冲回" },
  { value: "partial", label: "部分到账" },
];

const emptyProfile: ProfilePayload = {
  user: null,
  profile: null,
  credits: 0,
  totalCreditsUsed: 0,
};

const defaultPageInfo: PageInfo = { hasMore: false, nextCursor: null, limit: 30 };
const defaultCreditFilters: CreditFilters = { direction: "all", type: "all", q: "", from: "", to: "", sort: "newest" };
const defaultOrderFilters: OrderFilters = {
  status: "all",
  creditGrantStatus: "all",
  mode: "all",
  q: "",
  from: "",
  to: "",
  sort: "newest",
};

const helpItems = [
  {
    title: "充值后没有到账怎么办？",
    body: "微信、支付宝等异步支付以 Stripe webhook 为准。支付完成后通常会在几秒内入账，如果页面没有自动刷新，可以到充值记录查看订单和到账状态。",
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
    body: "顶部导航的作品库会进入历史记录；个人中心主要保留账户、积分、订单和反馈的运营视角。",
  },
];

export function AccountCenterClient() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AccountTab>("account");
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfile);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [creditFilters, setCreditFilters] = useState<CreditFilters>(defaultCreditFilters);
  const [orderFilters, setOrderFilters] = useState<OrderFilters>(defaultOrderFilters);
  const [creditPageInfo, setCreditPageInfo] = useState<PageInfo>(defaultPageInfo);
  const [orderPageInfo, setOrderPageInfo] = useState<PageInfo>(defaultPageInfo);
  const [creditSummary, setCreditSummary] = useState<CreditSummary>({ pageIncome: 0, pageSpend: 0, count: 0 });
  const [orderSummary, setOrderSummary] = useState<OrderSummary>({ pageNetAmount: 0, pageGrantedCredits: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creditLoading, setCreditLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(true);
  const [creditLoadingMore, setCreditLoadingMore] = useState(false);
  const [orderLoadingMore, setOrderLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackForm>({
    category: "billing",
    title: "",
    description: "",
    contact: "",
  });
  const [feedbackStatus, setFeedbackStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    void loadProfileAndTickets();
    void loadCreditLogs(defaultCreditFilters, { reset: true });
    void loadOrders(defaultOrderFilters, { reset: true });
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    setActiveTab(isAccountTab(tab) ? tab : "account");
  }, [searchParams]);

  const latestBalance = profile.credits ?? creditLogs[0]?.balance ?? 0;
  const paidOrders = useMemo(() => orders.filter((order) => order.status === "paid"), [orders]);
  const totalPaidAmount = paidOrders.reduce((sum, order) => sum + Math.max(0, order.amountNet ?? order.amountTotal - order.amountRefunded), 0);
  const totalGrantedCredits = paidOrders.reduce((sum, order) => sum + Math.max(0, order.creditsGranted), 0);
  const openTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const displayName = profile.profile?.displayName || profile.user?.email?.split("@")[0] || "VastWearGen 用户";
  const shortUserId = profile.user?.id ? profile.user.id.slice(0, 8) : "--";

  async function loadProfileAndTickets(options: { silent?: boolean } = {}) {
    if (options.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setTicketError(null);

    try {
      const [profileResult, ticketsResult] = await Promise.allSettled([
        fetchJson<ProfilePayload>("/api/profile"),
        fetchJson<{ tickets?: SupportTicket[] }>("/api/support/feedback"),
      ]);

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
      } else if (profileResult.reason?.status === 401) {
        window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      } else {
        throw profileResult.reason;
      }

      if (ticketsResult.status === "fulfilled") {
        setTickets(Array.isArray(ticketsResult.value.tickets) ? ticketsResult.value.tickets : []);
      } else {
        setTicketError(ticketsResult.reason instanceof Error ? ticketsResult.reason.message : "客服记录加载失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "个人中心加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadCreditLogs(filters: CreditFilters, options: { reset?: boolean; cursor?: string | null } = {}) {
    if (options.cursor) setCreditLoadingMore(true);
    else setCreditLoading(true);
    setCreditError(null);

    try {
      const payload = await fetchJson<{ logs?: CreditLog[]; pageInfo?: PageInfo; summary?: CreditSummary }>(
        `/api/credits/logs?${buildCreditQuery(filters, options.cursor)}`,
      );
      setCreditLogs((current) => (options.cursor ? [...current, ...(payload.logs || [])] : payload.logs || []));
      setCreditPageInfo(payload.pageInfo || defaultPageInfo);
      setCreditSummary(payload.summary || { pageIncome: 0, pageSpend: 0, count: payload.logs?.length || 0 });
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "积分明细加载失败");
      if (!options.cursor) {
        setCreditLogs([]);
        setCreditPageInfo(defaultPageInfo);
      }
    } finally {
      setCreditLoading(false);
      setCreditLoadingMore(false);
    }
  }

  async function loadOrders(filters: OrderFilters, options: { reset?: boolean; cursor?: string | null } = {}) {
    if (options.cursor) setOrderLoadingMore(true);
    else setOrderLoading(true);
    setOrderError(null);

    try {
      const payload = await fetchJson<{ orders?: BillingOrder[]; pageInfo?: PageInfo; summary?: OrderSummary }>(
        `/api/billing/orders?${buildOrderQuery(filters, options.cursor)}`,
      );
      setOrders((current) => (options.cursor ? [...current, ...(payload.orders || [])] : payload.orders || []));
      setOrderPageInfo(payload.pageInfo || defaultPageInfo);
      setOrderSummary(payload.summary || { pageNetAmount: 0, pageGrantedCredits: 0, count: payload.orders?.length || 0 });
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "充值记录加载失败");
      if (!options.cursor) {
        setOrders([]);
        setOrderPageInfo(defaultPageInfo);
      }
    } finally {
      setOrderLoading(false);
      setOrderLoadingMore(false);
    }
  }

  function selectTab(tab: AccountTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }

  function applyCreditFilters(next: CreditFilters) {
    setCreditFilters(next);
    void loadCreditLogs(next, { reset: true });
  }

  function applyOrderFilters(next: OrderFilters) {
    setOrderFilters(next);
    void loadOrders(next, { reset: true });
  }

  async function refreshCurrent() {
    setRefreshing(true);
    await Promise.all([
      loadProfileAndTickets({ silent: true }),
      loadCreditLogs(creditFilters, { reset: true }),
      loadOrders(orderFilters, { reset: true }),
    ]);
    setRefreshing(false);
  }

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingFeedback(true);
    setFeedbackStatus(null);
    try {
      const response = await fetch("/api/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...feedback, pageUrl: window.location.href }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "反馈提交失败");
      setFeedback({ category: feedback.category, title: "", description: "", contact: "" });
      setFeedbackStatus({ type: "success", text: `已提交，工单号 ${data.ticket?.ticketNo || ""}`.trim() });
      const ticketsPayload = await fetchJson<{ tickets?: SupportTicket[] }>("/api/support/feedback");
      setTickets(Array.isArray(ticketsPayload.tickets) ? ticketsPayload.tickets : []);
      setTicketError(null);
    } catch (err) {
      setFeedbackStatus({ type: "error", text: err instanceof Error ? err.message : "反馈提交失败" });
    } finally {
      setSubmittingFeedback(false);
    }
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.compactAlgorithm,
        token: {
          colorPrimary: "#5b7cff",
          colorInfo: "#5b7cff",
          colorSuccess: "#22885f",
          colorWarning: "#a66a00",
          colorError: "#d13b35",
          colorTextBase: "#0f172a",
          colorBgLayout: "#f6f8fb",
          borderRadius: 8,
          borderRadiusLG: 8,
          fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 13,
        },
        components: {
          Card: { borderRadiusLG: 8, headerBg: "#ffffff" },
          Table: { headerBg: "#f8fafc", rowHoverBg: "#f8fafc", cellPaddingBlockSM: 9, cellPaddingInlineSM: 12 },
          Button: { borderRadius: 8, controlHeight: 34 },
          Select: { borderRadius: 8, controlHeight: 36 },
          Input: { borderRadius: 8, controlHeight: 36 },
        },
      }}
    >
      <main className="min-h-screen bg-[#f6f8fb] px-3 py-5 text-codex-ink sm:px-5 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1460px] gap-5 lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/60">
            <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-slate-950">
              <div className="flex items-center gap-3">
                <Avatar name={displayName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">ID {shortUserId}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-slate-500">可用积分</span>
                <span className="text-sm font-semibold">{formatNumber(latestBalance)}</span>
              </div>
            </div>
            <nav className="space-y-1" aria-label="个人中心模块">
              {tabs.map((tab) => (
                <TabButton key={tab.key} tab={tab} active={activeTab === tab.key} onClick={() => selectTab(tab.key)} />
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 lg:hidden">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/50">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={displayName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{displayName}</p>
                  <p className="text-xs font-semibold text-slate-500">可用积分 {formatNumber(latestBalance)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshCurrent()}
                disabled={refreshing}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.16)] disabled:opacity-60"
                aria-label="刷新个人中心"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="个人中心模块">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => selectTab(tab.key)}
                  className={`h-10 shrink-0 rounded-lg px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.16)] ${
                    activeTab === tab.key
                      ? "border border-[rgba(91,124,255,0.35)] bg-white text-[var(--codex-accent)] shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:text-slate-950"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "account" && (
            <AccountHero
              displayName={displayName}
              email={profile.user?.email || ""}
              credits={latestBalance}
              totalPaidAmount={totalPaidAmount}
              totalGrantedCredits={totalGrantedCredits}
              openTickets={openTickets}
              creditLogs={creditLogs}
              orders={orders}
              loading={loading}
              refreshing={refreshing}
              onRefresh={() => void refreshCurrent()}
            />
          )}

          {error && <ErrorBanner message={error} onRetry={() => void loadProfileAndTickets()} />}

          <div className={activeTab === "account" ? "mt-5" : ""}>
            {loading && activeTab === "account" ? (
              <AccountSkeleton />
            ) : (
              <>
                {activeTab === "account" && (
                  <div className="space-y-4">
                    <AccountInfo profile={profile} orders={orders} openTickets={openTickets} />
                    <AIProductionPanel logs={creditLogs} summary={creditSummary} loading={creditLoading} />
                  </div>
                )}
                {activeTab === "credits" && (
                  <CreditLogsPanel
                    filters={creditFilters}
                    logs={creditLogs}
                    summary={creditSummary}
                    pageInfo={creditPageInfo}
                    loading={creditLoading}
                    loadingMore={creditLoadingMore}
                    error={creditError}
                    onFiltersChange={applyCreditFilters}
                    onRetry={() => void loadCreditLogs(creditFilters, { reset: true })}
                    onLoadMore={() => void loadCreditLogs(creditFilters, { cursor: creditPageInfo.nextCursor })}
                  />
                )}
                {activeTab === "orders" && (
                  <OrdersPanel
                    filters={orderFilters}
                    orders={orders}
                    summary={orderSummary}
                    pageInfo={orderPageInfo}
                    loading={orderLoading}
                    loadingMore={orderLoadingMore}
                    error={orderError}
                    onFiltersChange={applyOrderFilters}
                    onRetry={() => void loadOrders(orderFilters, { reset: true })}
                    onLoadMore={() => void loadOrders(orderFilters, { cursor: orderPageInfo.nextCursor })}
                  />
                )}
                {activeTab === "help" && <HelpPanel />}
                {activeTab === "messages" && <MessagesPanel orders={orders} tickets={tickets} ticketError={ticketError} />}
                {activeTab === "feedback" && (
                  <FeedbackPanel
                    form={feedback}
                    status={feedbackStatus}
                    tickets={tickets}
                    ticketError={ticketError}
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
    </ConfigProvider>
  );
}

function AccountHero({
  displayName,
  email,
  credits,
  totalPaidAmount,
  totalGrantedCredits,
  openTickets,
  creditLogs,
  orders,
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
  creditLogs: CreditLog[];
  orders: BillingOrder[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const aiLogs = creditLogs.filter(isAiGenerationLog);
  const refundLogs = creditLogs.filter(isRefundLog);
  const todayAiCount = aiLogs.filter((log) => isToday(log.created_at)).length;
  const recentAiSpend = aiLogs.reduce((sum, log) => sum + Math.abs(Math.min(0, log.amount)), 0);
  const paidOrderCount = orders.filter((order) => order.status === "paid").length;
  const latestModel = extractModelLabel(aiLogs[0]?.reason) || "待生成";
  const estimatedOutputs = Math.max(0, Math.floor(credits / 8));
  const capacityPercent = Math.max(credits > 0 ? 8 : 0, Math.min(100, Math.round((credits / Math.max(credits + recentAiSpend, 1)) * 100)));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="border-slate-200 shadow-sm" styles={{ body: { padding: 20 } }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Space size={8} wrap>
              <Tag color="blue" icon={<Sparkles className="h-3.5 w-3.5" />}>AI 生产账户</Tag>
              <Tag icon={<ShieldCheck className="h-3.5 w-3.5" />}>{email || displayName}</Tag>
              <Tag icon={<Bot className="h-3.5 w-3.5" />}>{latestModel}</Tag>
            </Space>
            <Title level={2} className="!mb-1 !mt-3 !text-2xl !font-semibold !text-slate-950 sm:!text-3xl">账户工作台</Title>
            <Text type="secondary" className="block max-w-3xl !text-sm !leading-6">
              聚合 AI 生成任务、积分资产、Stripe 充值和客服状态。这里展示的是生产账户的运行概览，详细流水在下方模块筛选查询。
            </Text>
          </div>
          <Space wrap>
            <Button icon={<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />} loading={refreshing} onClick={onRefresh}>
              刷新
            </Button>
            <Link href="/pricing">
              <Button type="primary" icon={<CreditCard className="h-4 w-4" />}>充值中心</Button>
            </Link>
          </Space>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroStatistic title="可用积分" value={loading ? "--" : formatNumber(credits)} note={`约可生成 ${formatNumber(estimatedOutputs)} 张`} icon={Coins} tone="accent" />
          <HeroStatistic title="今日 AI 任务" value={formatNumber(todayAiCount)} note="按当前流水页统计" icon={Activity} tone="slate" />
          <HeroStatistic title="失败/退款入账" value={formatNumber(refundLogs.length)} note="退款、补偿、人工调整" icon={RotateCcw} tone="warning" />
          <HeroStatistic title="客服待处理" value={formatNumber(openTickets)} note={paidOrderCount ? `已支付 ${paidOrderCount} 笔` : "暂无已支付订单"} icon={LifeBuoy} tone="success" />
        </div>
      </Card>

      <Card
        title={<Space size={8}><Bot className="h-4 w-4 text-[var(--codex-accent)]" />AI 资产与产能</Space>}
        extra={<Tag color={credits > 0 ? "green" : "default"}>{credits > 0 ? "可继续生成" : "待充值"}</Tag>}
        className="border-slate-200 shadow-sm"
        styles={{ body: { padding: 20 } }}
      >
        <Space direction="vertical" size={16} className="w-full">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>积分容量</span>
              <span>{formatNumber(credits)} / 最近消耗 {formatNumber(recentAiSpend)}</span>
            </div>
            <Progress percent={capacityPercent} showInfo={false} strokeColor="#5b7cff" trailColor="#eef2f7" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AssetFact label="实付净额" value={formatCny(totalPaidAmount)} />
            <AssetFact label="到账积分" value={formatNumber(totalGrantedCredits)} />
            <AssetFact label="最近模型" value={latestModel} />
            <AssetFact label="可生成估算" value={`${formatNumber(estimatedOutputs)} 张`} />
          </div>
        </Space>
      </Card>
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

function AIProductionPanel({ logs, summary, loading }: { logs: CreditLog[]; summary: CreditSummary; loading: boolean }) {
  const aiLogs = logs.filter(isAiGenerationLog).slice(0, 8);
  const refundCount = logs.filter(isRefundLog).length;
  const columns: ColumnsType<CreditLog> = [
    {
      title: "AI 任务",
      dataIndex: "reason",
      width: 420,
      render: (_, log) => <CreditReasonCell log={log} />,
    },
    {
      title: "模型 / 组件",
      width: 170,
      render: (_, log) => <AiComponentTag log={log} />,
    },
    {
      title: "积分",
      dataIndex: "amount",
      width: 120,
      align: "right",
      render: (_, log) => <CreditAmount log={log} />,
    },
    {
      title: "处理状态",
      width: 130,
      render: (_, log) => (log.amount > 0 ? <Tag color="green">已回退</Tag> : <Tag color="blue">已扣费</Tag>),
    },
    {
      title: "时间",
      dataIndex: "created_at",
      width: 150,
      render: (value: string) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
  ];

  return (
    <Panel title="AI 生产动态" description="最近生成、扣费、失败退款和补偿记录会优先展示在这里。">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MetricCard label="本页 AI 消耗" value={`-${formatNumber(summary.pageSpend)}`} tone="accent" />
        <MetricCard label="退款/补偿" value={formatNumber(refundCount)} tone="success" />
        <MetricCard label="最近任务数" value={formatNumber(aiLogs.length)} tone="slate" />
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={aiLogs}
        loading={loading}
        pagination={false}
        scroll={{ x: 900 }}
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 AI 生产流水" /> }}
      />
    </Panel>
  );
}

function CreditLogsPanel({
  filters,
  logs,
  summary,
  pageInfo,
  loading,
  loadingMore,
  error,
  onFiltersChange,
  onRetry,
  onLoadMore,
}: {
  filters: CreditFilters;
  logs: CreditLog[];
  summary: CreditSummary;
  pageInfo: PageInfo;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onFiltersChange: (value: CreditFilters) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const hasFilters = hasCreditFilters(filters);
  const columns: ColumnsType<CreditLog> = [
    {
      title: "AI 任务 / 原因",
      dataIndex: "reason",
      width: 420,
      render: (_, log) => <CreditReasonCell log={log} />,
    },
    {
      title: "组件",
      width: 150,
      render: (_, log) => <AiComponentTag log={log} />,
    },
    {
      title: "积分",
      dataIndex: "amount",
      width: 120,
      align: "right",
      sorter: (a, b) => a.amount - b.amount,
      render: (_, log) => <CreditAmount log={log} />,
    },
    {
      title: "余额",
      dataIndex: "balance",
      width: 120,
      align: "right",
      render: (value: number) => <Text strong>{formatNumber(value)}</Text>,
    },
    {
      title: "时间",
      dataIndex: "created_at",
      width: 160,
      render: (value: string) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
  ];

  return (
    <Panel title="积分明细" description="扣费、失败退款、充值入账和人工调整都会出现在这里。">
      <CreditFiltersBar filters={filters} onChange={onFiltersChange} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard label="当前页收入" value={`+${formatNumber(summary.pageIncome)}`} tone="success" />
        <MetricCard label="当前页支出" value={`-${formatNumber(summary.pageSpend)}`} tone="accent" />
        <MetricCard label="匹配记录" value={`${formatNumber(summary.count)}`} tone="slate" />
      </div>
      {error ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : loading ? (
        <ListSkeleton rows={5} />
      ) : logs.length ? (
        <>
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={logs}
            pagination={false}
            scroll={{ x: 900 }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          />
          <LoadMoreButton pageInfo={pageInfo} loading={loadingMore} onClick={onLoadMore} />
        </>
      ) : (
        <EmptyState
          title={hasFilters ? "当前筛选无结果" : "暂无积分明细"}
          description={hasFilters ? "换个时间、类型或关键词再试一次。" : "完成充值、生成或退款后，这里会显示余额变化。"}
          actionHref={hasFilters ? undefined : "/pricing"}
          actionText={hasFilters ? undefined : "前往充值中心"}
          onReset={hasFilters ? () => onFiltersChange(defaultCreditFilters) : undefined}
        />
      )}
    </Panel>
  );
}

function CreditFiltersBar({ filters, onChange }: { filters: CreditFilters; onChange: (value: CreditFilters) => void }) {
  return (
    <Card
      size="small"
      title={<Space size={6}><SlidersHorizontal className="h-4 w-4 text-[var(--codex-accent)]" />筛选</Space>}
      className="mb-4 border-slate-200 shadow-none"
      styles={{ body: { padding: 12 } }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectField label="收支" value={filters.direction} onChange={(direction) => onChange({ ...filters, direction: direction as CreditDirection })}>
          <option value="all">全部收支</option>
          <option value="income">收入</option>
          <option value="spend">支出</option>
        </SelectField>
        <SelectField label="类型" value={filters.type} onChange={(type) => onChange({ ...filters, type: type as CreditType })}>
          {creditTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="排序" value={filters.sort} onChange={(sort) => onChange({ ...filters, sort: sort as CreditSort })}>
          <option value="newest">时间从新到旧</option>
          <option value="oldest">时间从旧到新</option>
          <option value="amount_desc">金额从高到低</option>
          <option value="amount_asc">金额从低到高</option>
        </SelectField>
        <SearchField value={filters.q} placeholder="原因 / 任务 ID" onSubmit={(q) => onChange({ ...filters, q })} />
      </div>
      <DateFilterRow filters={filters} onChange={(next) => onChange({ ...filters, ...next })} onReset={() => onChange(defaultCreditFilters)} />
    </Card>
  );
}

function OrdersPanel({
  filters,
  orders,
  summary,
  pageInfo,
  loading,
  loadingMore,
  error,
  onFiltersChange,
  onRetry,
  onLoadMore,
}: {
  filters: OrderFilters;
  orders: BillingOrder[];
  summary: OrderSummary;
  pageInfo: PageInfo;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onFiltersChange: (value: OrderFilters) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const hasFilters = hasOrderFilters(filters);
  const columns: ColumnsType<BillingOrder> = [
    {
      title: "套餐 / Stripe",
      dataIndex: "productName",
      width: 360,
      render: (_, order) => <OrderProductCell order={order} />,
    },
    {
      title: "金额",
      width: 130,
      align: "right",
      sorter: (a, b) => (a.amountNet ?? a.amountTotal - a.amountRefunded) - (b.amountNet ?? b.amountTotal - b.amountRefunded),
      render: (_, order) => {
        const netAmount = order.amountNet ?? Math.max(0, order.amountTotal - order.amountRefunded);
        return (
          <Space direction="vertical" size={0} className="items-end">
            <Text strong>{formatCny(netAmount)}</Text>
            {order.amountRefunded > 0 && <Text type="warning" className="!text-xs">已退 {formatCny(order.amountRefunded)}</Text>}
          </Space>
        );
      },
    },
    {
      title: "到账积分",
      width: 130,
      align: "right",
      render: (_, order) => (
        <Space direction="vertical" size={0} className="items-end">
          <Text strong className="!text-[var(--codex-accent)]">{formatNumber(order.creditsGranted || order.creditsExpected)}</Text>
          {order.creditsGranted < order.creditsExpected && <Text type="warning" className="!text-xs">预计 {formatNumber(order.creditsExpected)}</Text>}
        </Space>
      ),
    },
    {
      title: "状态",
      width: 190,
      render: (_, order) => (
        <Space size={4} wrap>
          <StatusBadge label={statusLabel(order.status)} tone={order.status === "paid" ? "success" : order.status.includes("refund") ? "warning" : "slate"} />
          <StatusBadge label={grantStatusLabel(order.creditGrantStatus)} tone={order.creditGrantStatus === "granted" ? "success" : order.creditGrantStatus === "failed" ? "danger" : "slate"} />
        </Space>
      ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
  ];

  return (
    <Panel title="充值记录" description="记录 Stripe 支付状态、到账积分和退款状态。">
      <OrderFiltersBar filters={filters} onChange={onFiltersChange} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard label="当前页实付" value={formatCny(summary.pageNetAmount)} tone="slate" />
        <MetricCard label="当前页到账积分" value={formatNumber(summary.pageGrantedCredits)} tone="accent" />
        <MetricCard label="匹配订单" value={formatNumber(summary.count)} tone="slate" />
      </div>
      {error ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : loading ? (
        <ListSkeleton rows={5} />
      ) : orders.length ? (
        <>
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={orders}
            pagination={false}
            scroll={{ x: 980 }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          />
          <LoadMoreButton pageInfo={pageInfo} loading={loadingMore} onClick={onLoadMore} />
        </>
      ) : (
        <EmptyState
          title={hasFilters ? "当前筛选无结果" : "暂无充值记录"}
          description={hasFilters ? "换个状态、时间或订单关键词再查一次。" : "你还没有购买过套餐。充值成功后，订单会同步到这里。"}
          actionHref={hasFilters ? undefined : "/pricing"}
          actionText={hasFilters ? undefined : "进入充值中心"}
          onReset={hasFilters ? () => onFiltersChange(defaultOrderFilters) : undefined}
        />
      )}
    </Panel>
  );
}

function OrderFiltersBar({ filters, onChange }: { filters: OrderFilters; onChange: (value: OrderFilters) => void }) {
  return (
    <Card
      size="small"
      title={<Space size={6}><SlidersHorizontal className="h-4 w-4 text-[var(--codex-accent)]" />筛选</Space>}
      className="mb-4 border-slate-200 shadow-none"
      styles={{ body: { padding: 12 } }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectField label="支付状态" value={filters.status} onChange={(status) => onChange({ ...filters, status: status as OrderStatus })}>
          {orderStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="到账状态"
          value={filters.creditGrantStatus}
          onChange={(creditGrantStatus) => onChange({ ...filters, creditGrantStatus: creditGrantStatus as OrderGrantStatus })}
        >
          {orderGrantStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="模式" value={filters.mode} onChange={(mode) => onChange({ ...filters, mode: mode as OrderMode })}>
          <option value="all">全部模式</option>
          <option value="payment">一次性购买</option>
          <option value="subscription">订阅</option>
        </SelectField>
        <SelectField label="排序" value={filters.sort} onChange={(sort) => onChange({ ...filters, sort: sort as OrderSort })}>
          <option value="newest">时间从新到旧</option>
          <option value="oldest">时间从旧到新</option>
          <option value="amount_desc">金额从高到低</option>
          <option value="amount_asc">金额从低到高</option>
          <option value="credits_desc">到账积分最多</option>
          <option value="updated_desc">最近更新</option>
        </SelectField>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr]">
        <SearchField value={filters.q} placeholder="订单号 / Stripe / 套餐" onSubmit={(q) => onChange({ ...filters, q })} />
        <DateFilterRow filters={filters} onChange={(next) => onChange({ ...filters, ...next })} onReset={() => onChange(defaultOrderFilters)} compact />
      </div>
    </Card>
  );
}

function HelpPanel() {
  return (
    <Panel title="帮助中心" description="高频问题放在前面，遇到具体订单问题可直接提交反馈。">
      <div className="grid gap-3 md:grid-cols-2">
        {helpItems.map((item) => (
          <article key={item.title} className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/30">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]">
              <CircleHelp className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.body}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function MessagesPanel({ orders, tickets, ticketError }: { orders: BillingOrder[]; tickets: SupportTicket[]; ticketError: string | null }) {
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
      {ticketError && <InlineError message={ticketError} />}
      {messages.length ? (
        <div className="space-y-2">
          {messages.map((message) => {
            const Icon = message.icon;
            return (
              <div key={message.id} className="flex gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/30">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-950">{message.title}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-600">{message.body}</p>
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
  ticketError,
  submitting,
  onChange,
  onSubmit,
}: {
  form: FeedbackForm;
  status: { type: "success" | "error"; text: string } | null;
  tickets: SupportTicket[];
  ticketError: string | null;
  submitting: boolean;
  onChange: (value: FeedbackForm) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="客服反馈" description="充值、积分、生成和账户问题都可以提交，后台会生成工单。">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">反馈类型</span>
              <Select
                value={form.category}
                onChange={(category) => onChange({ ...form, category })}
                options={feedbackCategories.map((category) => ({ value: category.value, label: category.label }))}
                className="mt-2 w-full"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">联系方式</span>
              <Input
                value={form.contact}
                onChange={(event) => onChange({ ...form, contact: event.target.value })}
                placeholder="邮箱 / 微信 / 手机号"
                className="mt-2"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">标题</span>
            <Input
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
              placeholder="例如：微信支付成功但积分未到账"
              className="mt-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">问题描述</span>
            <Input.TextArea
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
              placeholder="请描述发生时间、操作页面、订单或任务信息。"
              rows={6}
              className="mt-2"
              required
            />
          </label>
          {status && (
            <Alert type={status.type === "success" ? "success" : "error"} message={status.text} showIcon />
          )}
          <Button type="primary" htmlType="submit" loading={submitting} icon={!submitting ? <Send className="h-4 w-4" /> : undefined}>
            提交反馈
          </Button>
        </form>
      </Panel>
      <Panel title="反馈记录" description="最近提交的工单会显示处理状态。">
        {ticketError && <InlineError message={ticketError} />}
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.16)] ${
        active ? "bg-[#f5f7ff] text-slate-950 ring-1 ring-[rgba(91,124,255,0.2)]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {active && <span className="absolute left-0 top-3 h-8 w-1 rounded-r-full bg-[var(--codex-accent)]" aria-hidden="true" />}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{tab.label}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium opacity-70">{tab.description}</span>
      </span>
    </button>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card
      className="border-slate-200 shadow-sm shadow-slate-200/50"
      styles={{ body: { padding: 20 } }}
      title={
        <div className="min-w-0 py-1">
          <div className="text-lg font-semibold text-slate-950">{title}</div>
          <div className="mt-0.5 text-xs font-normal leading-5 text-slate-500">{description}</div>
        </div>
      }
    >
      {children}
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const element = child as ReactElement<{ value?: string; children?: React.ReactNode }>;
      return { value: String(element.props.value ?? ""), label: element.props.children };
    });

  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <Select value={value} onChange={onChange} options={options} className="mt-2 w-full" />
    </label>
  );
}

function SearchField({ value, placeholder, onSubmit }: { value: string; placeholder: string; onSubmit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <form
      className="block"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft.trim());
      }}
    >
      <span className="text-xs font-semibold text-slate-500">关键词</span>
      <Input.Search
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onSearch={(next) => onSubmit(next.trim())}
        placeholder={placeholder}
        allowClear
        enterButton="查询"
        className="mt-2"
      />
    </form>
  );
}

function DateFilterRow({
  filters,
  onChange,
  onReset,
  compact = false,
}: {
  filters: { from: string; to: string };
  onChange: (value: { from: string; to: string }) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "" : "mt-3"} flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between`}>
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">开始日期</span>
          <Input type="date" value={filters.from} onChange={(event) => onChange({ from: event.target.value, to: filters.to })} className="mt-2" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">结束日期</span>
          <Input type="date" value={filters.to} onChange={(event) => onChange({ from: filters.from, to: event.target.value })} className="mt-2" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((days) => (
          <Button key={days} onClick={() => onChange(getQuickRange(days))}>
            近{days}天
          </Button>
        ))}
        <Button onClick={onReset} icon={<RotateCcw className="h-3.5 w-3.5" />}>
          重置
        </Button>
      </div>
    </div>
  );
}

function HeroStatistic({
  title,
  value,
  note,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: "accent" | "success" | "warning" | "slate";
}) {
  const color = tone === "accent" ? "#5b7cff" : tone === "success" ? "#22885f" : tone === "warning" ? "#a66a00" : "#0f172a";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500">{title}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <Statistic value={value} styles={{ content: { color, fontSize: 24, fontWeight: 600, lineHeight: 1.15 } }} />
      <div className="mt-1 truncate text-xs text-slate-500">{note}</div>
    </div>
  );
}

function AssetFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950" title={value}>
        {value}
      </div>
    </div>
  );
}

function CreditReasonCell({ log }: { log: CreditLog }) {
  const ai = isAiGenerationLog(log);
  const taskId = log.generation_id ? log.generation_id.slice(0, 12) : null;
  return (
    <Space size={10} align="start">
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ai ? "bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)]" : "bg-slate-100 text-slate-500"}`}>
        {ai ? <ImageIcon className="h-4 w-4" /> : log.amount > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <Text strong className="block !text-slate-950">{log.reason || (ai ? "AI 生成扣费" : "积分变动")}</Text>
        <Text type="secondary" className="block !text-xs">
          {taskId ? `任务 ${taskId}` : creditTypeLabel((log.type || "other") as CreditType)}
        </Text>
      </span>
    </Space>
  );
}

function AiComponentTag({ log }: { log: CreditLog }) {
  const model = extractModelLabel(log.reason);
  if (isAiGenerationLog(log)) {
    return (
      <Tag color="blue" icon={<Bot className="h-3.5 w-3.5" />}>
        {model || "AI 生成"}
      </Tag>
    );
  }
  if (isRefundLog(log)) return <Tag color="green" icon={<RotateCcw className="h-3.5 w-3.5" />}>退款/补偿</Tag>;
  return <Tag>{creditTypeLabel((log.type || "other") as CreditType)}</Tag>;
}

function CreditAmount({ log }: { log: CreditLog }) {
  const positive = log.amount > 0;
  return (
    <Text strong className={positive ? "!text-[#22885f]" : "!text-[var(--codex-accent)]"}>
      {positive ? "+" : ""}{formatNumber(log.amount)}
    </Text>
  );
}

function OrderProductCell({ order }: { order: BillingOrder }) {
  return (
    <Space size={10} align="start">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <CreditCard className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <Text strong className="block !text-slate-950">{order.productName}</Text>
        <Text type="secondary" className="block !text-xs">{order.priceLabel || (order.mode === "subscription" ? "订阅" : "一次性购买")}</Text>
        <Text type="secondary" className="block break-all !text-[11px]">订单 {order.id}</Text>
      </span>
    </Space>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-950">{value || "-"}</p>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "success" | "accent" | "slate" }) {
  const colors = {
    success: "#22885f",
    accent: "#5b7cff",
    slate: "#0f172a",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <Statistic title={label} value={value} styles={{ content: { color: colors[tone], fontWeight: 600, fontSize: 24 } }} />
    </div>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-950">{ticket.title}</p>
          <p className="mt-1 break-all text-xs font-semibold text-slate-400">{ticket.ticketNo || ticket.categoryLabel} · {formatDateTime(ticket.createdAt)}</p>
        </div>
        <StatusBadge label={ticketStatusLabel(ticket.status)} tone={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "warning"} />
      </div>
      <p className="mt-3 line-clamp-2 break-words text-sm font-semibold leading-6 text-slate-600">{ticket.description}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionHref,
  actionText,
  onReset,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionText?: string;
  onReset?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="font-semibold text-slate-700">{title}</span>} />
      <p className="mx-auto mt-[-8px] max-w-md text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onReset && (
          <Button onClick={onReset} icon={<RotateCcw className="h-3.5 w-3.5" />}>
            清除筛选
          </Button>
        )}
        {actionHref && actionText && (
          <Link href={actionHref}>
            <Button type="primary" icon={<ArrowRight className="h-4 w-4" />}>
              {actionText}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <button type="button" onClick={onRetry} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700">
        重试
      </button>
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700">
          重试
        </button>
      )}
    </div>
  );
}

function LoadMoreButton({ pageInfo, loading, onClick }: { pageInfo: PageInfo; loading: boolean; onClick: () => void }) {
  if (!pageInfo.hasMore || !pageInfo.nextCursor) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button onClick={onClick} loading={loading}>
        加载更多
      </Button>
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-label="加载中">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
      <div className="h-6 w-36 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
        ))}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "V";
  return (
    <AntAvatar shape="square" size={42} className="!shrink-0 !bg-slate-950 !text-sm !font-semibold !text-white">
      {initial}
    </AntAvatar>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "slate" }) {
  const colors = {
    success: "success",
    warning: "warning",
    danger: "error",
    slate: "default",
  };
  return <Tag color={colors[tone]} className="!mr-0">{label}</Tag>;
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

function buildCreditQuery(filters: CreditFilters, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "30", sort: filters.sort });
  if (filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

function buildOrderQuery(filters: OrderFilters, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "30", sort: filters.sort });
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.creditGrantStatus !== "all") params.set("creditGrantStatus", filters.creditGrantStatus);
  if (filters.mode !== "all") params.set("mode", filters.mode);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

function isAccountTab(value: unknown): value is AccountTab {
  return typeof value === "string" && tabs.some((tab) => tab.key === value);
}

function hasCreditFilters(filters: CreditFilters) {
  return filters.direction !== "all" || filters.type !== "all" || Boolean(filters.q.trim()) || Boolean(filters.from) || Boolean(filters.to) || filters.sort !== "newest";
}

function hasOrderFilters(filters: OrderFilters) {
  return (
    filters.status !== "all"
    || filters.creditGrantStatus !== "all"
    || filters.mode !== "all"
    || Boolean(filters.q.trim())
    || Boolean(filters.from)
    || Boolean(filters.to)
    || filters.sort !== "newest"
  );
}

function getQuickRange(days: number) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - days + 1);
  return { from: formatDateInput(from), to: formatDateInput(now) };
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function creditTypeLabel(value: CreditType) {
  return creditTypeOptions.find((option) => option.value === value)?.label || "其他";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待支付",
    processing: "处理中",
    paid: "已支付",
    failed: "失败",
    canceled: "已取消",
    refunded: "已退款",
    partially_refunded: "部分退款",
  };
  return labels[status] || status || "未知";
}

function grantStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "入账中",
    granted: "已到账",
    failed: "入账失败",
    skipped: "无需到账",
    refunded: "已退款",
    reversed: "已冲回",
    partial: "部分到账",
  };
  return labels[status] || status || "未同步";
}

function ticketStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "待处理",
    pending: "处理中",
    in_progress: "处理中",
    resolved: "已解决",
    closed: "已关闭",
  };
  return labels[status] || status || "待处理";
}

function isAiGenerationLog(log: CreditLog) {
  if (log.type === "generation") return true;
  const text = `${log.reason || ""} ${log.generation_id || ""}`;
  return log.amount < 0 && /(gpt|image|生成|换模|姿势|服装|上身|抠图|参考|ai)/i.test(text);
}

function isRefundLog(log: CreditLog) {
  if (log.amount <= 0) return false;
  if (["refund", "compensation"].includes(log.type || "")) return true;
  return /(退款|退回|返还|补偿|失败)/i.test(log.reason || "");
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function extractModelLabel(reason?: string | null) {
  if (!reason) return "";
  const bracket = reason.match(/\(([^()]*gpt[^()]*)\)/i);
  if (bracket?.[1]) return bracket[1].trim();
  const model = reason.match(/gpt[-_\w.]+(?:\s*,\s*[^，、)]+)?/i);
  if (model?.[0]) return model[0].trim();
  return "";
}
