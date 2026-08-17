"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfigProvider,
  DatePicker,
  Empty,
  Form,
  Input,
  Select,
  Statistic,
  Table,
  Tag,
  Typography,
  theme as uiTheme,
  zhCN,
  type ColumnsType,
} from "@/components/ui/shadcn-compat";
import { useTranslations } from "next-intl";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  CreditCard,
  KeyRound,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime as formatDateTimeLocalized, formatNumber as formatNumberLocalized } from "@/lib/i18n/format";
import { RoutingPreferenceCard } from "@/components/account/RoutingPreferenceCard";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

type AccountTab = "account" | "api" | "rights" | "membership" | "orders" | "credits" | "apiUsage" | "help" | "distribution" | "messages" | "feedback";
type CreditDirection = "all" | "income" | "spend";
type CreditType = "all" | "recharge" | "generation" | "refund" | "manual" | "compensation" | "other";
type CreditSort = "newest" | "oldest" | "amount_desc" | "amount_asc";
type OrderStatus = "all" | "pending" | "processing" | "paid" | "failed" | "canceled" | "refunded" | "partially_refunded";
type OrderGrantStatus = "all" | "pending" | "granted" | "failed" | "skipped" | "refunded" | "reversed" | "partial";
type OrderMode = "all" | "payment" | "subscription";
type OrderSort = "newest" | "oldest" | "amount_desc" | "amount_asc" | "credits_desc" | "updated_desc";
type DateRangeValue = [{ format: (format: string) => string }, { format: (format: string) => string }];

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

type CreditFilters = {
  product: string;
  feature: string;
  direction: CreditDirection;
  type: CreditType;
  consumeMode: string;
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

type FeedbackForm = {
  category: string;
  title: string;
  description: string;
  contact: string;
};

const emptyProfile: ProfilePayload = { user: null, profile: null, credits: 0, totalCreditsUsed: 0 };
const defaultPageInfo: PageInfo = { hasMore: false, nextCursor: null, limit: 20 };
const defaultCreditFilters: CreditFilters = {
  product: "all",
  feature: "all",
  direction: "spend",
  type: "all",
  consumeMode: "all",
  q: "",
  from: "",
  to: "",
  sort: "newest",
};
const defaultOrderFilters: OrderFilters = {
  status: "all",
  creditGrantStatus: "all",
  mode: "all",
  q: "",
  from: "",
  to: "",
  sort: "newest",
};

const accountGroups: Array<{
  key: string;
  label: string;
  /** i18n 消息键（Account.sidebarGroups.* / Account.tabs.*） */
  labelKey?: string;
  icon: ComponentType<{ className?: string }>;
  children: Array<{ key: AccountTab; label: string; labelKey?: string; description?: string }>;
}> = [
  {
    key: "account",
    label: "个人账号",
    labelKey: "Account.sidebarGroups.account",
    icon: UserRound,
    children: [
      { key: "account", label: "账号信息", labelKey: "Account.tabs.account" },
      { key: "api", label: "API令牌", labelKey: "Account.tabs.api" },
      { key: "rights", label: "权益中心", labelKey: "Account.tabs.rights" },
      { key: "membership", label: "会员中心", labelKey: "Account.tabs.membership" },
    ],
  },
  {
    key: "billing",
    label: "消费管理",
    labelKey: "Account.sidebarGroups.billing",
    icon: WalletCards,
    children: [
      { key: "orders", label: "订单管理", labelKey: "Account.tabs.orders" },
      { key: "credits", label: "灵点明细", labelKey: "Account.tabs.credits" },
      { key: "apiUsage", label: "API中心", labelKey: "Account.tabs.apiUsage" },
    ],
  },
  { key: "help", label: "帮助中心", labelKey: "Account.sidebarGroups.help", icon: CircleHelp, children: [{ key: "help", label: "帮助中心", labelKey: "Account.tabs.help" }] },
  { key: "distribution", label: "邀请好友", labelKey: "Account.sidebarGroups.distribution", icon: Users, children: [{ key: "distribution", label: "邀请好友", labelKey: "Account.tabs.distribution" }] },
  { key: "messages", label: "消息中心", labelKey: "Account.sidebarGroups.messages", icon: Mail, children: [{ key: "messages", label: "消息中心", labelKey: "Account.tabs.messages" }] },
  { key: "feedback", label: "客服反馈", labelKey: "Account.sidebarGroups.feedback", icon: MessageSquare, children: [{ key: "feedback", label: "客服反馈", labelKey: "Account.tabs.feedback" }] },
];

const creditTypeOptions: Array<{ value: CreditType; label: string; labelKey?: string }> = [
  { value: "all", label: "全部", labelKey: "Account.panels.type.all" },
  { value: "recharge", label: "充值到账", labelKey: "Account.panels.type.recharge" },
  { value: "generation", label: "生成扣费", labelKey: "Account.panels.type.generation" },
  { value: "refund", label: "退款/退回", labelKey: "Account.panels.type.refund" },
  { value: "manual", label: "人工调整", labelKey: "Account.panels.type.manual" },
  { value: "compensation", label: "系统补偿", labelKey: "Account.panels.type.compensation" },
  { value: "other", label: "其他", labelKey: "Account.panels.type.other" },
];

const featureOptions = [
  { value: "all", label: "全部", labelKey: "Account.panels.feature.all" },
  { value: "tryon", label: "服装上身", labelKey: "Account.panels.feature.tryon" },
  { value: "pose", label: "姿势裂变", labelKey: "Account.panels.feature.pose" },
  { value: "model", label: "AI换模特", labelKey: "Account.panels.feature.model" },
  { value: "image", label: "AI图片", labelKey: "Account.panels.feature.image" },
];

const productOptions = [
  { value: "all", label: "全部", labelKey: "Account.panels.type.all" },
  { value: "vastweargen", label: "Pixel Diffusion" },
];

const feedbackCategories = [
  { value: "billing", label: "充值支付", labelKey: "Account.panels.feedbackCategory.billing" },
  { value: "credit_issue", label: "灵点异常", labelKey: "Account.panels.feedbackCategory.creditIssue" },
  { value: "generation_failure", label: "生成问题", labelKey: "Account.panels.feedbackCategory.generationFailure" },
  { value: "account", label: "账户问题", labelKey: "Account.panels.feedbackCategory.account" },
  { value: "technical", label: "功能异常", labelKey: "Account.panels.feedbackCategory.technical" },
  { value: "other", label: "其他建议", labelKey: "Account.panels.feedbackCategory.other" },
];

const helpItems = [
  { title: "充值后没有到账怎么办？", body: "微信、支付宝等异步支付以 Stripe webhook 为准，通常几秒内入账。可在充值记录中查看订单和到账状态。", titleKey: "Account.panels.help.qa1Title", bodyKey: "Account.panels.help.qa1Body" },
  { title: "灵点为什么会被扣除？", body: "确认生成后会扣除灵点，任务失败会自动退回。灵点明细会记录扣费、退款和人工补偿。", titleKey: "Account.panels.help.qa2Title", bodyKey: "Account.panels.help.qa2Body" },
  { title: "如何联系客服？", body: "在客服反馈中提交问题，系统会生成工单，后台可按充值、灵点和生成问题优先处理。", titleKey: "Account.panels.help.qa3Title", bodyKey: "Account.panels.help.qa3Body" },
];

export function AccountCenterClient() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AccountTab>("account");
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfile);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [creditFilters, setCreditFilters] = useState<CreditFilters>(defaultCreditFilters);
  const [orderFilters, setOrderFilters] = useState<OrderFilters>(defaultOrderFilters);
  const [creditPage, setCreditPage] = useState(1);
  const [creditPageSize, setCreditPageSize] = useState(20);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);
  const [creditSummary, setCreditSummary] = useState<CreditSummary>({ pageIncome: 0, pageSpend: 0, count: 0 });
  const [orderSummary, setOrderSummary] = useState<OrderSummary>({ pageNetAmount: 0, pageGrantedCredits: 0, count: 0 });
  const [creditPageInfo, setCreditPageInfo] = useState<PageInfo>(defaultPageInfo);
  const [orderPageInfo, setOrderPageInfo] = useState<PageInfo>(defaultPageInfo);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [creditLoading, setCreditLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackForm>({ category: "billing", title: "", description: "", contact: "" });
  const [feedbackStatus, setFeedbackStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const loadCreditLogsRef = useRef(loadCreditLogs);
  const loadOrdersRef = useRef(loadOrders);

  useEffect(() => {
    loadCreditLogsRef.current = loadCreditLogs;
    loadOrdersRef.current = loadOrders;
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    setActiveTab(isAccountTab(tab) ? tab : "account");
  }, [searchParams]);

  useEffect(() => {
    void loadProfileAndTickets();
  }, []);

  useEffect(() => {
    void loadCreditLogsRef.current();
  }, [creditFilters, creditPage, creditPageSize]);

  useEffect(() => {
    void loadOrdersRef.current();
  }, [orderFilters, orderPage, orderPageSize]);

  const t = useTranslations("Account");
  const displayName = profile.profile?.displayName || profile.user?.email?.split("@")[0] || t("panels.common.defaultUser");
  const maskedAccount = profile.user?.email ? maskAccountLabel(profile.user.email) : displayName;
  const userId = profile.user?.id || "--";
  const latestBalance = profile.credits ?? creditLogs[0]?.balance ?? 0;
  const totalUsed = profile.totalCreditsUsed ?? 0;
  const paidOrders = orders.filter((order) => order.status === "paid").length;
  const openTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;

  async function loadProfileAndTickets(options: { silent?: boolean } = {}) {
    if (options.silent) setRefreshing(true);
    else setLoadingProfile(true);
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
        setTicketError(ticketsResult.reason instanceof Error ? ticketsResult.reason.message : t("panels.common.loadTicketFailed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("panels.common.loadCenterFailed"));
    } finally {
      setLoadingProfile(false);
      setRefreshing(false);
    }
  }

  async function loadCreditLogs() {
    setCreditLoading(true);
    setCreditError(null);
    try {
      const payload = await fetchJson<{ logs?: CreditLog[]; pageInfo?: PageInfo; summary?: CreditSummary }>(
        `/api/credits/logs?${buildCreditQuery(creditFilters, creditPage, creditPageSize)}`,
      );
      setCreditLogs(payload.logs || []);
      setCreditPageInfo(payload.pageInfo || defaultPageInfo);
      setCreditSummary(payload.summary || { pageIncome: 0, pageSpend: 0, count: payload.logs?.length || 0 });
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : t("panels.common.loadCreditFailed"));
      setCreditLogs([]);
      setCreditPageInfo(defaultPageInfo);
    } finally {
      setCreditLoading(false);
    }
  }

  async function loadOrders() {
    setOrderLoading(true);
    setOrderError(null);
    try {
      const payload = await fetchJson<{ orders?: BillingOrder[]; pageInfo?: PageInfo; summary?: OrderSummary }>(
        `/api/billing/orders?${buildOrderQuery(orderFilters, orderPage, orderPageSize)}`,
      );
      setOrders(payload.orders || []);
      setOrderPageInfo(payload.pageInfo || defaultPageInfo);
      setOrderSummary(payload.summary || { pageNetAmount: 0, pageGrantedCredits: 0, count: payload.orders?.length || 0 });
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : t("panels.common.loadOrderFailed"));
      setOrders([]);
      setOrderPageInfo(defaultPageInfo);
    } finally {
      setOrderLoading(false);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([loadProfileAndTickets({ silent: true }), loadCreditLogs(), loadOrders()]);
    setRefreshing(false);
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
      const response = await fetch("/api/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...feedback, pageUrl: window.location.href }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t("panels.common.feedbackFailed"));
      setFeedback({ category: feedback.category, title: "", description: "", contact: "" });
      setFeedbackStatus({ type: "success", text: `${t("panels.common.feedbackSubmitted")}${data.ticket?.ticketNo || ""}`.trim() });
      await loadProfileAndTickets({ silent: true });
    } catch (err) {
      setFeedbackStatus({ type: "error", text: err instanceof Error ? err.message : t("panels.common.feedbackFailed") });
    } finally {
      setSubmittingFeedback(false);
    }
  }

  const tAccount = useTranslations("Account");
  const activeTitle = tAccount(`tabs.${activeTab}`);

  return (
    <ConfigProvider
      locale={zhCN}
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{
        algorithm: uiTheme.compactAlgorithm,
        token: {
          colorPrimary: "#5b7cff",
          colorInfo: "#5b7cff",
          colorSuccess: "#22885f",
          colorWarning: "#a66a00",
          colorError: "#d13b35",
          colorTextBase: "#111827",
          colorBgLayout: "transparent",
          borderRadius: 10,
          borderRadiusLG: 16,
          borderRadiusSM: 8,
          fontFamily: 'var(--codex-font)',
          fontSize: 14,
          motion: false,
          controlHeight: 36,
          colorBgContainer: "rgba(255,255,255,0.86)",
          colorBorder: "var(--codex-border)",
          colorBorderSecondary: "var(--codex-border)",
          colorSplit: "rgba(17,24,39,0.08)",
        },
        components: {
          Button: { borderRadius: 12, controlHeight: 36, primaryShadow: "0 1px 2px rgba(5,5,5,0.08)" },
          Card: { borderRadiusLG: 16, headerBg: "transparent" },
          DatePicker: { borderRadius: 10, controlHeight: 36 },
          Input: { borderRadius: 10, controlHeight: 36 },
          Select: { borderRadius: 10, controlHeight: 36 },
          Table: { headerBg: "var(--codex-accent-06)", rowHoverBg: "var(--codex-accent-06)", cellPaddingBlockSM: 13, cellPaddingInlineSM: 12 },
        },
      }}
    >
      <main className="min-h-screen px-4 py-6 text-codex-ink sm:px-6 lg:px-10" style={{ backgroundImage: "var(--codex-gradient-page)", backgroundAttachment: "fixed" }}>
        <div className="mx-auto grid w-full max-w-[1360px] gap-6 lg:grid-cols-[206px_minmax(0,1fr)] lg:items-start">
          <AccountSidebar activeTab={activeTab} onSelect={selectTab} />

          <section className="min-w-0" key={activeTab} style={{ animation: "motion-rise-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <Title level={3} className="!mb-0 !text-[22px] !font-semibold">
                  {activeTitle}
                </Title>
                <Text type="secondary">{tAccount("subtitle")}</Text>
              </div>
              <Button icon={<RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />} onClick={() => void refreshAll()} loading={refreshing}>
                {tAccount("refresh")}
              </Button>
            </div>

            {error ? <Alert className="mb-4" type="error" showIcon message={error} /> : null}

            {activeTab === "account" ? (
              <AccountInfoPanel
                displayName={displayName}
                maskedAccount={maskedAccount}
                userId={userId}
                email={profile.user?.email || ""}
                credits={latestBalance}
                totalUsed={totalUsed}
                paidOrders={paidOrders}
                openTickets={openTickets}
                loading={loadingProfile}
              />
            ) : null}

            {activeTab === "credits" ? (
              <CreditLogsPanel
                filters={creditFilters}
                logs={creditLogs}
                summary={creditSummary}
                pageInfo={creditPageInfo}
                page={creditPage}
                pageSize={creditPageSize}
                loading={creditLoading}
                error={creditError}
                onFiltersChange={(next) => {
                  setCreditPage(1);
                  setCreditFilters(next);
                }}
                onPageChange={(page, pageSize) => {
                  setCreditPage(page);
                  setCreditPageSize(pageSize);
                }}
              />
            ) : null}

            {activeTab === "orders" ? (
              <OrdersPanel
                filters={orderFilters}
                orders={orders}
                summary={orderSummary}
                pageInfo={orderPageInfo}
                page={orderPage}
                pageSize={orderPageSize}
                loading={orderLoading}
                error={orderError}
                onFiltersChange={(next) => {
                  setOrderPage(1);
                  setOrderFilters(next);
                }}
                onPageChange={(page, pageSize) => {
                  setOrderPage(page);
                  setOrderPageSize(pageSize);
                }}
              />
            ) : null}

            {activeTab === "help" ? <HelpPanel /> : null}
            {activeTab === "messages" ? <MessagesPanel orders={orders} tickets={tickets} ticketError={ticketError} /> : null}
            {activeTab === "feedback" ? (
              <FeedbackPanel
                feedback={feedback}
                status={feedbackStatus}
                submitting={submittingFeedback}
                onChange={setFeedback}
                onSubmit={submitFeedback}
              />
            ) : null}
            {activeTab === "distribution" ? (
              <InvitePanel />
            ) : null}
            {["api", "rights", "membership", "apiUsage"].includes(activeTab) ? (
              <ComingSoonPanel tab={activeTab} />
            ) : null}
          </section>
        </div>
      </main>
    </ConfigProvider>
  );
}

import { InvitePanel } from "@/components/account/InvitePanel";
function AccountSidebar({ activeTab, onSelect }: { activeTab: AccountTab; onSelect: (tab: AccountTab) => void }) {
  const t = useTranslations("Account");
  const tAny = useTranslations(); // 数据键全路径（Account.tabs.* / Account.panels.*）
  return (
    <aside className="hidden w-[206px] shrink-0 lg:block">
      <nav className="sticky top-24 min-h-[720px] w-[206px] rounded-2xl border border-[var(--codex-border)] bg-[var(--codex-surface-soft)] px-4 py-5 backdrop-blur-xl" aria-label={t("sidebarAria")}>
        {accountGroups.map((group) => {
          const Icon = group.icon;
          const expanded = group.children.some((item) => item.key === activeTab);
          const single = group.children.length === 1 && group.children[0].key === group.key;
          return (
            <div key={group.key} className="border-b border-[var(--codex-border)]/80 py-2 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(group.children[0].key)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-medium transition-colors",
                  expanded
                    ? "bg-white/90 text-codex-ink shadow-sm ring-1 ring-[var(--codex-accent-28)]"
                    : "text-codex-muted hover:bg-white/70 hover:text-codex-ink",
                )}
                aria-current={expanded && single ? "page" : undefined}
                aria-expanded={group.children.length > 1 ? expanded : undefined}
              >
                <Icon className={cn("h-4 w-4", expanded ? "text-[#5b7cff]" : "text-codex-muted")} />
                <span className="flex-1">{group.labelKey ? tAny(group.labelKey) : group.label}</span>
                {group.children.length > 1 ? <ChevronDown className={cn("h-4 w-4 text-codex-muted transition", expanded && "rotate-180 text-[#5b7cff]")} /> : null}
              </button>
              {group.children.length > 1 && expanded ? (
                <div className="mt-2 space-y-1 pl-7">
                  {group.children.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelect(item.key)}
                      className={cn(
                        "relative flex h-8 w-full items-center rounded-md px-4 text-left text-sm transition-colors",
                        activeTab === item.key
                          ? "bg-[#e9eeff] font-medium text-[#3154d4]"
                          : "text-codex-muted hover:bg-white/70 hover:text-codex-ink",
                      )}
                      aria-current={activeTab === item.key ? "page" : undefined}
                    >
                      {activeTab === item.key ? <span className="absolute left-2 h-3.5 w-0.5 rounded-full bg-[#5b7cff]" /> : null}
                      {item.labelKey ? tAny(item.labelKey) : item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function AccountInfoPanel({
  displayName,
  maskedAccount,
  userId,
  email,
  credits,
  totalUsed,
  paidOrders,
  openTickets,
  loading,
}: {
  displayName: string;
  maskedAccount: string;
  userId: string;
  email: string;
  credits: number;
  totalUsed: number;
  paidOrders: number;
  openTickets: number;
  loading: boolean;
}) {
  const t = useTranslations("Account");
  if (loading) {
    return <Card loading className="min-h-[420px]" />;
  }

  return (
    <div>
      <AccountAssetCard displayName={displayName} maskedAccount={maskedAccount} credits={credits} />
      <div className="my-8 border-t border-codex-ink" />
      <section>
        <h2 className="mb-6 border-l-4 border-[#5b7cff] pl-3 text-lg font-semibold text-codex-ink">{t("panels.account.title")}</h2>
        <div className="divide-y divide-slate-200">
          <InfoLine label={t("panels.account.userId")} value={shortUserId(userId, 12)} />
          <InfoLine label={t("panels.account.username")} value={displayName} hint={t("panels.account.usernameHint")} action={t("panels.account.usernameAction")} />
          <InfoLine label={t("panels.account.phone")} value={maskedAccount.includes("@") ? t("panels.account.phoneUnbound") : maskedAccount} action={t("panels.account.phoneChange")} />
          <InfoLine label={t("panels.account.email")} value={email || t("panels.account.emailUnbound")} action={email ? t("panels.account.emailChange") : t("panels.account.emailBind")} />
          <InfoLine label={t("panels.account.password")} value={t("panels.account.passwordHint")} action={t("panels.account.passwordAction")} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <SmallMetric label={t("panels.account.currentCredits")} value={t("panels.account.creditsValue", { count: formatNumber(credits) })} />
          <SmallMetric label={t("panels.account.totalUsed")} value={t("panels.account.creditsValue", { count: formatNumber(totalUsed) })} />
          <SmallMetric label={t("panels.account.paidOrders")} value={t("panels.account.ordersValue", { count: formatNumber(paidOrders) })} />
          <SmallMetric label={t("panels.account.customerStatus")} value={openTickets ? t("panels.account.customerPending", { count: openTickets }) : t("panels.account.customerEmpty")} />
        </div>
        <RoutingPreferenceCard />
      </section>
    </div>
  );
}

function AccountAssetCard({ displayName, maskedAccount, credits }: { displayName: string; maskedAccount: string; credits: number }) {
  const t = useTranslations("Account");
  return (
    <section className="rounded-xl bg-[#eef3f4] px-7 py-5 dark:bg-[var(--codex-surface)]">
      <div className="mb-4 flex items-center gap-3">
        <Avatar size={28} src="/logo.png" className="!bg-[#f9d66d]" />
        <span className="text-sm font-semibold">{maskedAccount || displayName}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_332px]">
        <div className="relative min-h-[128px] overflow-hidden rounded-xl bg-gradient-to-r from-[#edf4f4] to-[#dfe7e6] dark:from-codex-muted dark:to-codex-ink px-7 py-6">
          <div className="pointer-events-none absolute right-16 top-[-20px] h-28 w-28 rounded-full bg-white/45 blur-xl" />
          <p className="text-lg font-semibold">{t("panels.account.freeTier")}</p>
          <div className="mt-16 flex flex-wrap gap-5 text-sm text-codex-muted">
            <span>{t("panels.account.freeTierCredits")}</span>
            <span>{t("panels.account.freeTierFeatures")}</span>
          </div>
          <Link href="/pricing" className="absolute bottom-6 right-8 rounded-md bg-[#4f5b60] px-8 py-2 text-sm font-semibold text-white">
            {t("panels.account.upgrade")}
          </Link>
        </div>
        <div className="min-h-[128px] rounded-xl bg-gradient-to-r from-[#303237] to-[#77797d] px-7 py-6 text-white">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">{t("panels.account.creditsCount", { count: formatNumber(credits) })}</p>
            <span className="rounded-full border border-white/40 px-2 py-0.5 text-xs text-white/80">{t("panels.account.creditRules")}</span>
          </div>
          <div className="mt-10 text-sm">
            <p className="font-semibold">{t("panels.account.locked", { count: formatNumber(0) })}</p>
            <p className="mt-1 text-white/90">{t("panels.account.expiring", { count: formatNumber(0) })}</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Link href="/account?tab=credits" className="rounded-md bg-white/25 px-6 py-2 text-sm font-semibold text-white">
              {t("panels.account.redeem")}
            </Link>
            <Link href="/pricing" className="rounded-md bg-white/25 px-6 py-2 text-sm font-semibold text-white">
              {t("panels.account.buy")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function CreditLogsPanel({
  filters,
  logs,
  summary,
  pageInfo,
  page,
  pageSize,
  loading,
  error,
  onFiltersChange,
  onPageChange,
}: {
  filters: CreditFilters;
  logs: CreditLog[];
  summary: CreditSummary;
  pageInfo: PageInfo;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  onFiltersChange: (filters: CreditFilters) => void;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  const t = useTranslations("Account");
  const tAny = useTranslations(); // 数据键全路径（Account.panels.*）
  const [form] = Form.useForm<CreditFilters & { range?: DateRangeValue }>();
  const columns = useMemo<ColumnsType<CreditLog>>(
    () => [
      { title: t("panels.credits.colProduct"), width: 120, render: () => "Pixel Diffusion" },
      { title: t("panels.credits.colFeature"), width: 170, render: (_, log) => featureLabel(t, log.reason) },
      { title: t("panels.credits.colConsumeMode"), width: 130, render: (_, log) => (log.amount < 0 ? t("panels.credits.consumeSaas") : t("panels.credits.consumeRecharge")) },
      { title: t("panels.credits.colTime"), dataIndex: "created_at", width: 170, render: formatDateTime },
      { title: t("panels.credits.colAmount"), dataIndex: "amount", width: 100, align: "center", render: (value: number) => <span className={value < 0 ? "text-red-500" : "text-emerald-600"}>{value > 0 ? "+" : ""}{formatNumber(value)}</span> },
      { title: t("panels.credits.colTaskId"), dataIndex: "generation_id", width: 140, render: (value: string | null, log) => shortUserId(value || log.id, 8) },
      { title: t("panels.credits.colType"), width: 120, render: (_, log) => creditTypeLabel(tAny, (log.type || "other") as CreditType) },
      { title: t("panels.credits.colRemark"), dataIndex: "reason", ellipsis: true, render: (value: string | null) => value || "-" },
    ],
    [t],
  );

  return (
    <section>
      {error ? <Alert className="mb-4" type="error" showIcon message={error} /> : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ ...filters, range: toRangeValue(filters) }}
        onFinish={(values) => {
          const [from, to] = dateRangeToStrings(values.range);
          onFiltersChange({
            ...filters,
            ...values,
            from,
            to,
            q: "",
          });
        }}
        className="mb-6 !block"
      >
        <div className="grid gap-x-6 gap-y-4 xl:grid-cols-3">
          <FilterItem label={t("panels.credits.filter.product")} name="product"><Select options={productOptions} optionRender={(o) => o.data.labelKey ? tAny(o.data.labelKey) : o.data.label} /></FilterItem>
          <FilterItem label={t("panels.credits.filter.feature")} name="feature"><Select options={featureOptions} optionRender={(o) => o.data.labelKey ? tAny(o.data.labelKey) : o.data.label} /></FilterItem>
          <FilterItem label={t("panels.credits.filter.type")} name="type"><Select options={creditTypeOptions} optionRender={(o) => o.data.labelKey ? tAny(o.data.labelKey) : o.data.label} /></FilterItem>
          <FilterItem label={t("panels.credits.filter.direction")} name="direction">
            <Select options={[
              { value: "all", label: t("panels.directionOption.all") },
              { value: "income", label: t("panels.directionOption.income") },
              { value: "spend", label: t("panels.directionOption.spend") },
            ]} />
          </FilterItem>
          <FilterItem label={t("panels.credits.filter.time")} name="range"><RangePicker className="w-full" placeholder={[t("panels.credits.filter.dateStart"), t("panels.credits.filter.dateEnd")]} /></FilterItem>
          <FilterItem label={t("panels.credits.filter.consumeMode")} name="consumeMode">
            <Select options={[{
              value: "all", label: t("panels.consumeMode.all"),
            }, { value: "saas", label: t("panels.consumeMode.saas") }, { value: "stripe", label: t("panels.consumeMode.stripe") }]} />
          </FilterItem>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button onClick={() => {
            form.resetFields();
            onFiltersChange(defaultCreditFilters);
          }}>
            {t("panels.credits.filter.reset")}
          </Button>
          <Button type="primary" htmlType="submit">
            {t("panels.credits.filter.search")}
          </Button>
        </div>
      </Form>
      <Table<CreditLog>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={logs}
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total: summary.count,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (total, range) => t("panels.credits.total", { total, from: range[0], to: range[1] }),
          onChange: onPageChange,
        }}
        locale={{ emptyText: <Empty description={t("panels.credits.empty")} /> }}
      />
      <PageHint pageInfo={pageInfo} />
    </section>
  );
}

function OrdersPanel({
  filters,
  orders,
  summary,
  pageInfo,
  page,
  pageSize,
  loading,
  error,
  onFiltersChange,
  onPageChange,
}: {
  filters: OrderFilters;
  orders: BillingOrder[];
  summary: OrderSummary;
  pageInfo: PageInfo;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  onFiltersChange: (filters: OrderFilters) => void;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  const t = useTranslations("Account");
  const [form] = Form.useForm<OrderFilters & { range?: DateRangeValue }>();
  const columns = useMemo<ColumnsType<BillingOrder>>(
    () => [
      { title: t("panels.orders.colOrderId"), dataIndex: "id", width: 210, ellipsis: true },
      { title: t("panels.orders.colMode"), dataIndex: "mode", width: 120, render: (value: string) => (value === "subscription" ? t("panels.orders.subscription") : t("panels.orders.creditPack")) },
      { title: t("panels.orders.colName"), dataIndex: "productName", width: 180, ellipsis: true },
      { title: t("panels.orders.colTime"), dataIndex: "createdAt", width: 170, render: formatDateTime },
      { title: t("panels.orders.colStatus"), dataIndex: "status", width: 120, render: (value: string) => <StatusTag value={statusLabel(t, value)} status={value} /> },
      { title: t("panels.orders.colAmount"), width: 120, render: (_, order) => formatCny(order.amountNet ?? order.amountTotal - order.amountRefunded) },
      { title: t("panels.orders.colGrant"), width: 130, render: (_, order) => <Tag color={order.creditsExpected <= 0 ? "default" : order.creditGrantStatus === "granted" ? "blue" : "default"}>{order.creditsExpected <= 0 ? t("panels.orders.testNoGrant") : grantStatusLabel(t, order.creditGrantStatus)}</Tag> },
      { title: t("panels.orders.colAction"), width: 110, render: (_, order) => <Link href={`/account?tab=orders&q=${encodeURIComponent(order.id)}`} className="text-[#1677ff]">{t("panels.orders.detail")}</Link> },
    ],
    [t],
  );

  return (
    <section>
      {error ? <Alert className="mb-4" type="error" showIcon message={error} /> : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ ...filters, range: toRangeValue(filters) }}
        onFinish={(values) => {
          const [from, to] = dateRangeToStrings(values.range);
          onFiltersChange({
            ...defaultOrderFilters,
            status: values.status || "all",
            mode: values.mode || "all",
            from,
            to,
          });
        }}
        className="mb-6 !block"
      >
        <div className="grid gap-x-6 gap-y-4 xl:grid-cols-3">
          <FilterItem label={t("panels.orders.filter.payTime")} name="range"><RangePicker className="w-full" placeholder={[t("panels.orders.filter.dateStart"), t("panels.orders.filter.dateEnd")]} /></FilterItem>
          <FilterItem label={t("panels.orders.filter.status")} name="status">
            <Select options={[
              { value: "all", label: t("panels.orderStatus.all") },
              { value: "pending", label: t("panels.orderStatus.pending") },
              { value: "processing", label: t("panels.orderStatus.processing") },
              { value: "paid", label: t("panels.orderStatus.paid") },
              { value: "failed", label: t("panels.orderStatus.failed") },
              { value: "canceled", label: t("panels.orderStatus.canceled") },
              { value: "refunded", label: t("panels.orderStatus.refunded") },
            ]} />
          </FilterItem>
          <FilterItem label={t("panels.orders.filter.product")} name="mode">
            <Select options={[{ value: "all", label: t("panels.orderMode.all") }, { value: "payment", label: t("panels.orderMode.payment") }, { value: "subscription", label: t("panels.orderMode.subscription") }]} />
          </FilterItem>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button onClick={() => {
            form.resetFields();
            onFiltersChange(defaultOrderFilters);
          }}>
            {t("panels.orders.filter.reset")}
          </Button>
          <Button type="primary" htmlType="submit">
            {t("panels.orders.filter.search")}
          </Button>
        </div>
      </Form>
      <Table<BillingOrder>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={orders}
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total: summary.count,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (total, range) => t("panels.orders.total", { total, from: range[0], to: range[1] }),
          onChange: onPageChange,
        }}
        locale={{ emptyText: <Empty description={t("panels.orders.empty")} /> }}
      />
      <PageHint pageInfo={pageInfo} />
    </section>
  );
}

function HelpPanel() {
  const t = useTranslations("Account");
  const tAny = useTranslations(); // 数据键全路径（Account.panels.*）
  return (
    <Panel title={t("panels.help.title")} description={t("panels.help.description")}>
      <div className="space-y-3">
        {helpItems.map((item) => (
          <div key={item.title} className="rounded-md border border-[var(--codex-border)] bg-white p-4 dark:border-white/10 dark:bg-[var(--codex-surface)]">
            <p className="font-medium">{item.titleKey ? tAny(item.titleKey) : item.title}</p>
            <p className="mt-2 text-sm leading-6 text-codex-muted">{item.bodyKey ? t(item.bodyKey) : item.body}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MessagesPanel({ orders, tickets, ticketError }: { orders: BillingOrder[]; tickets: SupportTicket[]; ticketError: string | null }) {
  const t = useTranslations("Account");
  const messages = [
    ...orders.slice(0, 5).map((order) => ({
      id: `order-${order.id}`,
      title: `${order.productName} ${statusLabel(t, order.status)}`,
      text: `${formatDateTime(order.updatedAt)} · ${grantStatusLabel(t, order.creditGrantStatus)}`,
    })),
    ...tickets.slice(0, 5).map((ticket) => ({
      id: `ticket-${ticket.id}`,
      title: `${ticket.categoryLabel || t("panels.messages.ticketFallback")}：${ticket.title}`,
      text: `${ticketStatusLabel(t, ticket.status)} · ${formatDateTime(ticket.updatedAt)}`,
    })),
  ];

  return (
    <Panel title={t("panels.messages.title")} description={t("panels.messages.description")}>
      {ticketError ? <Alert className="mb-4" type="warning" showIcon message={ticketError} /> : null}
      {messages.length ? (
        <div className="divide-y divide-slate-100">
          {messages.map((message) => (
            <div key={message.id} className="flex items-start gap-3 py-4">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f6ff] text-[#5b7cff]">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium">{message.title}</p>
                <p className="mt-1 text-sm text-codex-muted">{message.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty description={t("panels.messages.empty")} />
      )}
    </Panel>
  );
}

function FeedbackPanel({
  feedback,
  status,
  submitting,
  onChange,
  onSubmit,
}: {
  feedback: FeedbackForm;
  status: { type: "success" | "error"; text: string } | null;
  submitting: boolean;
  onChange: (value: FeedbackForm) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("Account");
  const tAny = useTranslations(); // 数据键全路径（Account.panels.*）
  return (
    <Panel title={t("panels.feedback.title")} description={t("panels.feedback.description")}>
      {status ? <Alert className="mb-4" type={status.type} showIcon message={status.text} /> : null}
      <form onSubmit={onSubmit} className="max-w-[760px] space-y-4">
        <FormLine required label={t("panels.feedback.type")}>
          <Select value={feedback.category} options={feedbackCategories} optionRender={(o) => o.data.labelKey ? tAny(o.data.labelKey) : o.data.label} onChange={(category) => onChange({ ...feedback, category })} />
        </FormLine>
        <FormLine required label={t("panels.feedback.subject")}>
          <Input value={feedback.title} name="feedbackTitle" id="feedbackTitle" autoComplete="off" spellCheck={false} maxLength={80} placeholder={t("panels.feedback.subjectPlaceholder")} onChange={(event) => onChange({ ...feedback, title: event.target.value })} />
        </FormLine>
        <FormLine required label={t("panels.feedback.suggestion")}>
          <Input.TextArea value={feedback.description} name="feedbackDescription" id="feedbackDescription" autoComplete="off" spellCheck rows={5} maxLength={400} showCount placeholder={t("panels.feedback.suggestionPlaceholder")} onChange={(event) => onChange({ ...feedback, description: event.target.value })} />
        </FormLine>
        <FormLine label={t("panels.feedback.contact")}>
          <Input value={feedback.contact} name="feedbackContact" id="feedbackContact" autoComplete="off" spellCheck={false} placeholder={t("panels.feedback.contactPlaceholder")} onChange={(event) => onChange({ ...feedback, contact: event.target.value })} />
        </FormLine>
        <p className="text-sm text-orange-500">{t("panels.feedback.rewardHint")}</p>
        <Button type="primary" htmlType="submit" loading={submitting} icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}>
          {t("panels.feedback.submit")}
        </Button>
      </form>
    </Panel>
  );
}

function ComingSoonPanel({ tab }: { tab: AccountTab }) {
  const t = useTranslations("Account");
  const content: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
    api: { title: t("panels.comingSoon.apiTitle"), description: t("panels.comingSoon.apiDesc"), icon: <KeyRound className="h-5 w-5" /> },
    rights: { title: t("panels.comingSoon.rightsTitle"), description: t("panels.comingSoon.rightsDesc"), icon: <ShieldCheck className="h-5 w-5" /> },
    membership: { title: t("panels.comingSoon.membershipTitle"), description: t("panels.comingSoon.membershipDesc"), icon: <CreditCard className="h-5 w-5" /> },
    apiUsage: { title: t("panels.comingSoon.apiUsageTitle"), description: t("panels.comingSoon.apiUsageDesc"), icon: <WalletCards className="h-5 w-5" /> },
  };
  const item = content[tab] || content.api;
  return (
    <Panel title={item.title} description={item.description}>
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-[var(--codex-border)] bg-[var(--codex-surface-soft)] text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-codex-muted shadow-sm">{item.icon}</span>
        <p className="font-medium">{t("panels.comingSoon.reserved")}</p>
        <p className="mt-2 text-sm text-codex-muted">{t("panels.comingSoon.reservedHint")}</p>
      </div>
    </Panel>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card
      title={
        <div className="py-1">
          <div className="text-lg font-medium">{title}</div>
          <div className="mt-1 text-sm font-normal text-codex-muted">{description}</div>
        </div>
      }
      className="border-[var(--codex-border)]"
    >
      {children}
    </Card>
  );
}

function FilterItem({ label, name, children }: { label: string; name: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] items-center gap-3">
      <label className="whitespace-nowrap text-sm font-medium text-codex-ink">{label}:</label>
      <Form.Item name={name} noStyle>
        {children}
      </Form.Item>
    </div>
  );
}

function InfoLine({ label, value, hint, action }: { label: string; value: string; hint?: string; action?: string }) {
  return (
    <div className="grid gap-4 py-6 sm:grid-cols-[160px_minmax(0,1fr)_140px] sm:items-center">
      <div className="font-medium">{label}</div>
      <div className="min-w-0">
        <p className="break-words text-codex-ink">{value || "-"}</p>
        {hint ? <p className="mt-1 text-sm text-codex-muted">{hint}</p> : null}
      </div>
      {action ? <Button>{action}</Button> : <span />}
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--codex-border)] bg-white px-4 py-3 dark:border-white/10 dark:bg-[var(--codex-surface)]">
      <Statistic title={label} value={value} styles={{ content: { fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" } }} />
    </div>
  );
}

function FormLine({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-3 sm:grid-cols-[90px_minmax(0,1fr)] sm:items-start">
      <span className="pt-2 font-medium">
        {required ? <span className="mr-1 text-red-500">*</span> : null}
        {label}：
      </span>
      <span>{children}</span>
    </label>
  );
}

function PageHint({ pageInfo }: { pageInfo: PageInfo }) {
  const t = useTranslations("Account");
  if (!pageInfo.hasMore) return null;
  return <p className="mt-2 text-right text-xs text-codex-faint">{t("panels.common.moreRecords")}</p>;
}

function StatusTag({ value, status }: { value: string; status: string }) {
  const color = status === "paid" || status === "granted" ? "blue" : status === "failed" || status === "canceled" ? "red" : status === "pending" || status === "processing" ? "orange" : "default";
  return <Tag color={color}>{value}</Tag>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

function buildCreditQuery(filters: CreditFilters, page: number, pageSize: number) {
  const q = filters.q || (filters.feature !== "all" ? filters.feature : "");
  const params = new URLSearchParams({ limit: String(pageSize), cursor: String((page - 1) * pageSize), sort: filters.sort });
  if (filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.type !== "all") params.set("type", filters.type);
  if (q.trim()) params.set("q", q.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

function buildOrderQuery(filters: OrderFilters, page: number, pageSize: number) {
  const params = new URLSearchParams({ limit: String(pageSize), cursor: String((page - 1) * pageSize), sort: filters.sort });
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.creditGrantStatus !== "all") params.set("creditGrantStatus", filters.creditGrantStatus);
  if (filters.mode !== "all") params.set("mode", filters.mode);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

function isAccountTab(value: unknown): value is AccountTab {
  return typeof value === "string" && accountGroups.some((group) => group.children.some((item) => item.key === value));
}

function toRangeValue(filters: { from: string; to: string }) {
  return filters.from && filters.to ? [createDateValue(filters.from), createDateValue(filters.to)] as DateRangeValue : undefined;
}

function dateRangeToStrings(range?: DateRangeValue) {
  if (!range?.[0] || !range?.[1]) return ["", ""] as const;
  return [range[0].format("YYYY-MM-DD"), range[1].format("YYYY-MM-DD")] as const;
}

function createDateValue(value: string) {
  return {
    format: () => value,
  };
}

function featureLabel(t: (key: string) => string, reason?: string | null) {
  const text = reason || "";
  if (/pose|姿势/i.test(text)) return t("panels.feature.pose");
  if (/model|模特/i.test(text)) return t("panels.feature.model");
  if (/tryon|上身|服装/i.test(text)) return t("panels.feature.tryon");
  if (/gpt|image|图片/i.test(text)) return t("panels.feature.image");
  return t("panels.feature.aiGen");
}

function creditTypeLabel(tAny: (key: string) => string, value: CreditType) {
  const option = creditTypeOptions.find((option) => option.value === value);
  return option?.labelKey ? tAny(option.labelKey) : tAny("Account.panels.type.other");
}

function statusLabel(t: (key: string) => string, status: string) {
  const labels: Record<string, string> = {
    pending: t("panels.orderStatus.pending"),
    processing: t("panels.orderStatus.processing"),
    paid: t("panels.orderStatus.paid"),
    failed: t("panels.orderStatus.failed"),
    canceled: t("panels.orderStatus.canceled"),
    refunded: t("panels.orderStatus.refunded"),
    partially_refunded: t("panels.orderStatus.partiallyRefunded"),
  };
  return labels[status] || status || t("panels.orderStatus.unknown");
}

function grantStatusLabel(t: (key: string) => string, status: string) {
  const labels: Record<string, string> = {
    pending: t("panels.grantStatus.pending"),
    granted: t("panels.grantStatus.granted"),
    failed: t("panels.grantStatus.failed"),
    skipped: t("panels.grantStatus.skipped"),
    refunded: t("panels.grantStatus.refunded"),
    reversed: t("panels.grantStatus.reversed"),
    partial: t("panels.grantStatus.partial"),
  };
  return labels[status] || status || t("panels.grantStatus.unsynced");
}

function ticketStatusLabel(t: (key: string) => string, status: string) {
  const labels: Record<string, string> = {
    open: t("panels.ticketStatus.open"),
    pending: t("panels.ticketStatus.pending"),
    in_progress: t("panels.ticketStatus.inProgress"),
    resolved: t("panels.ticketStatus.resolved"),
    closed: t("panels.ticketStatus.closed"),
  };
  return labels[status] || status || t("panels.ticketStatus.default");
}

function formatNumber(value: number) {
  return formatNumberLocalized(value);
}

function formatCny(value: number) {
  return `¥${(Number(value || 0) / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null | undefined) {
  return formatDateTimeLocalized(value);
}

function shortUserId(value: string, length = 8) {
  return value ? value.slice(0, length) : "-";
}

function maskAccountLabel(value: string) {
  const [name, domain] = value.split("@");
  if (!domain) return value.length > 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
  return `${name.slice(0, 3)}****@${domain}`;
}
