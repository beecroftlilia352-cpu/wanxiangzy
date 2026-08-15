"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, CircleDollarSign, Crown, Loader2, Sparkles, Zap } from "lucide-react";
import { getImageCreditCostRange, IMAGE_CREDIT_COSTS, VIDEO_CREDIT_RATES } from "@/lib/model-pricing";
import { cn } from "@/lib/utils";

type PricingMode = "credits" | "subscription";

type T = (key: string, values?: Record<string, string | number | Date>) => string;

type UsageRule = {
  id: string;
  valueKey: string;
  valueVars: Record<string, string | number>;
  labelKey: string;
};

type CreditPlan = {
  key: string;
  titleKey: string;
  price: number;
  baseCredits: number;
  bonusCredits: number;
  savings?: number;
  featured?: boolean;
  enterpriseNoteKey?: string;
};

const CREDIT_PLANS: CreditPlan[] = [
  { key: "starter", titleKey: "starter", price: 35, baseCredits: 250, bonusCredits: 0 },
  { key: "pro", titleKey: "pro", price: 140, baseCredits: 1000, bonusCredits: 200, savings: 17 },
  {
    key: "business",
    titleKey: "business",
    price: 700,
    baseCredits: 5000,
    bonusCredits: 2000,
    savings: 29,
    featured: true,
  },
  {
    key: "premium",
    titleKey: "premium",
    price: 3500,
    baseCredits: 25000,
    bonusCredits: 13000,
    savings: 34,
    enterpriseNoteKey: "premiumNote",
  },
];

type BillingCatalogProduct = {
  id?: string;
  tierKey?: string;
  prices?: BillingCatalogPrice[];
};

type BillingCatalogPrice = {
  id?: string;
  mode?: "payment" | "subscription";
  unitAmount?: number;
  credits?: number;
  currency?: string;
};

type BillingCatalogResponse = {
  products?: BillingCatalogProduct[];
  activeSubscription?: {
    id?: string;
    status?: string;
    current_period_end?: string;
    currentPeriodEnd?: string;
  } | null;
};

type CheckoutNotice = {
  tone: "success" | "warning" | "danger" | "info";
  title: string;
  message: string;
};

const CREDIT_COSTS = {
  nanoBanana2: IMAGE_CREDIT_COSTS["nano-banana-2"]["1K"],
  gptImage2: IMAGE_CREDIT_COSTS["gpt-image-2"]["1K"],
  nanoBananaPro: IMAGE_CREDIT_COSTS["nano-banana-pro"]["1K"],
  fastVideo: VIDEO_CREDIT_RATES.fast["720p"].minimum,
  pro1080Video: VIDEO_CREDIT_RATES.pro["1080p"].minimum,
};

const nanoBanana2Range = getImageCreditCostRange("nano-banana-2");
const gptImage2Range = getImageCreditCostRange("gpt-image-2");
const nanoBananaProRange = getImageCreditCostRange("nano-banana-pro");

const usageRules: UsageRule[] = [
  { id: "nano-banana-2", valueKey: "creditsPerImage", valueVars: { min: nanoBanana2Range.minimum, max: nanoBanana2Range.maximum }, labelKey: "nanoBanana2" },
  { id: "gpt-image-2", valueKey: "creditsPerImage", valueVars: { min: gptImage2Range.minimum, max: gptImage2Range.maximum }, labelKey: "gptImage2" },
  { id: "nano-banana-pro", valueKey: "creditsPerImage", valueVars: { min: nanoBananaProRange.minimum, max: nanoBananaProRange.maximum }, labelKey: "nanoBananaPro" },
  { id: "fast-video", valueKey: "creditsFromVideo", valueVars: { start: CREDIT_COSTS.fastVideo }, labelKey: "fastVideo" },
  { id: "hd-video", valueKey: "creditsFromVideoDual", valueVars: { a: VIDEO_CREDIT_RATES.pro["720p"].minimum, b: CREDIT_COSTS.pro1080Video }, labelKey: "hdVideo" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.floor(value));
}

function getTotalCredits(plan: CreditPlan, mode: PricingMode) {
  const total = plan.baseCredits + plan.bonusCredits;
  return mode === "subscription" ? Math.floor(total * 1.05) : total;
}

function getCreditLine(plan: CreditPlan, mode: PricingMode, t: T) {
  if (mode === "subscription") {
    return <>{t("unitCredits", { count: formatNumber(getTotalCredits(plan, mode)) })}</>;
  }

  if (plan.bonusCredits <= 0) {
    return <>{t("unitCredits", { count: formatNumber(plan.baseCredits) })}</>;
  }

  return (
    <>
      {t("unitCredits", { count: formatNumber(plan.baseCredits) })}
      <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600">
        + <Sparkles className="h-3 w-3" aria-hidden="true" /> {t("bonusCredits", { count: formatNumber(plan.bonusCredits) })}
      </span>
    </>
  );
}

function buildFeatures(plan: CreditPlan, mode: PricingMode, t: T) {
  const credits = getTotalCredits(plan, mode);

  return [
    { primary: true, content: getCreditLine(plan, mode, t) },
    { content: t("approxImages", { count: formatNumber(credits / CREDIT_COSTS.nanoBanana2), model: "Nano Banana 2" }) },
    { content: t("approxImages", { count: formatNumber(credits / CREDIT_COSTS.gptImage2), model: "GPT Image 2" }) },
    { content: t("approxImages", { count: formatNumber(credits / CREDIT_COSTS.nanoBananaPro), model: "Nano Banana Pro" }) },
    { content: t("approxFastVideos", { count: formatNumber(credits / CREDIT_COSTS.fastVideo) }) },
    { content: t("approxHdVideos", { count: formatNumber(credits / CREDIT_COSTS.pro1080Video) }) },
    { content: mode === "subscription" ? t("autoDeduct") : t("noExpiry") },
    { content: mode === "subscription" ? t("cancelAnytime") : t("oneTimePurchase") },
  ];
}

export function PricingSection() {
  const t = useTranslations("Pricing");
  const router = useRouter();
  const [mode, setMode] = useState<PricingMode>("credits");
  const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [notice, setNotice] = useState<CheckoutNotice | null>(null);
  const plans = useMemo(() => CREDIT_PLANS, []);
  const priceMap = useMemo(() => buildPriceMap(catalog), [catalog]);
  const activeSubscription = catalog?.activeSubscription || null;

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");

    try {
      const response = await fetch("/api/billing/catalog", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as BillingCatalogResponse & { error?: string };
      if (response.status === 401) {
        router.replace("/login?next=/pricing");
        return;
      }
      if (!response.ok) throw new Error(payload.error || t("catalogLoadFailed", { status: response.status }));
      setCatalog(payload);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : t("catalogLoadFailedBase"));
    } finally {
      setCatalogLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = (params.get("checkout") || "").toLowerCase();
    const sessionId = params.get("session_id") || params.get("sessionId");

    if (checkout === "cancelled" || checkout === "canceled") {
      setNotice({
        tone: "warning",
        title: t("paymentCancelled"),
        message: t("paymentCancelledMsg"),
      });
      return;
    }

    if (!sessionId) return;
    setNotice({
      tone: "info",
      title: t("confirmingOrder"),
      message: t("confirmingOrderMsg"),
    });

    fetch(`/api/billing/orders/session/${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || t("orderQueryFailed"));
        const order = payload.order || {};
        const paid = order.status === "paid" || order.credit_grant_status === "granted";
        const creditsExpected = Number(order.credits_expected || 0);
        const creditsGranted = Number(order.credits_granted || 0);
        const testGrantDisabled = paid && creditsExpected <= 0 && creditsGranted <= 0;
        setNotice({
          tone: paid ? "success" : "info",
          title: paid ? t("paymentSuccess") : t("paymentConfirming"),
          message: testGrantDisabled
            ? t("testPaymentNoGrant")
            : paid
              ? t("creditsSynced", { count: Number(order.credits_granted || order.credits_expected || 0).toLocaleString("zh-CN") })
            : t("creditsSyncing"),
        });
        void loadCatalog();
      })
      .catch((error) => {
        setNotice({
          tone: "danger",
          title: t("orderQueryFailed"),
          message: error instanceof Error ? error.message : t("retryLater"),
        });
      });
  }, [loadCatalog]);

  async function startCheckout(plan: CreditPlan) {
    const billingMode = mode === "subscription" ? "subscription" : "payment";
    const price = priceMap.get(`${plan.key}:${billingMode}`);
    const priceId = price?.id || fallbackPriceId(plan.key, billingMode);

    if (!priceId) {
      setNotice({
        tone: "danger",
        title: t("planNotConfigured"),
        message: t("planNotConfiguredMsg"),
      });
      return;
    }

    setCheckoutPriceId(priceId);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/login?next=/pricing");
        return;
      }
      if (!response.ok) throw new Error(payload.error || t("createSessionFailed", { status: response.status }));
      if (typeof payload.url !== "string" || !payload.url) throw new Error(t("checkoutUrlCreateFailed"));
      window.location.assign(payload.url);
    } catch (error) {
      setNotice({
        tone: "danger",
        title: t("createSessionFailedTitle"),
        message: error instanceof Error ? error.message : t("retryLater"),
      });
    } finally {
      setCheckoutPriceId(null);
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/login?next=/pricing");
        return;
      }
      if (!response.ok) throw new Error(payload.error || t("openPortalFailed", { status: response.status }));
      if (typeof payload.url !== "string" || !payload.url) throw new Error(t("portalMissingUrl"));
      window.location.assign(payload.url);
    } catch (error) {
      setNotice({
        tone: "danger",
        title: t("openPortalFailedTitle"),
        message: error instanceof Error ? error.message : t("retryLater"),
      });
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <section className="min-h-screen px-4 py-16 transition-colors sm:px-6" aria-labelledby="pricing-title" style={{ backgroundImage: "var(--codex-gradient-page)", backgroundAttachment: "fixed" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">{t("eyebrow")}</p>
          <h1 id="pricing-title" className="mb-4 text-4xl font-black tracking-tight text-zinc-900 dark:text-stone-100" style={{ textWrap: "balance" }}>
            {t("heroTitle")}
          </h1>
          <p className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-1 text-base font-medium leading-relaxed text-zinc-700 dark:text-stone-300">
            <span>{t("heroServed")}</span>
            <span className="text-2xl font-black leading-none text-zinc-900 dark:text-stone-100">{t("heroCount")}</span>
            <span>{t("heroServedTail")}</span>
          </p>
        </div>

        <div className="mx-auto mb-12 grid h-14 w-full max-w-sm grid-cols-2 rounded-2xl bg-zinc-100 dark:bg-stone-800 p-1">
          <button
            type="button"
            aria-pressed={mode === "credits"}
            onClick={() => setMode("credits")}
            className={cn(
              "group order-1 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-zinc-700 dark:text-stone-300 transition-[background-color,color,box-shadow] duration-150",
              mode === "credits" && "bg-white text-zinc-900 dark:text-stone-100 shadow-sm"
            )}
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            <span>{t("buyCredits")}</span>
            <span
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 border-l border-zinc-200 pl-2 transition-opacity",
                mode === "credits" ? "opacity-95" : "opacity-60"
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--codex-accent)] text-[10px] font-black text-white">{t("payAli")}</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--codex-success)] text-[10px] font-black text-white">{t("payWechat")}</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "subscription"}
            onClick={() => setMode("subscription")}
            className={cn(
              "order-2 inline-flex items-center justify-center rounded-xl text-sm font-bold text-zinc-700 dark:text-stone-300 transition-[background-color,color,box-shadow] duration-150",
              mode === "subscription" && "bg-white text-zinc-900 dark:text-stone-100 shadow-sm"
            )}
          >
            <Crown className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("subscriptionTab")}
            <span className="ml-1 text-amber-700">+5%</span>
          </button>
        </div>

        {(notice || catalogError || activeSubscription) && (
          <div className="mx-auto mb-8 max-w-3xl space-y-3">
            {notice && <NoticeCard notice={notice} />}
            {catalogError && (
              <NoticeCard
                notice={{
                  tone: "danger",
                  title: t("catalogLoadFailedBase"),
                  message: catalogError,
                }}
              />
            )}
            {activeSubscription && (
              <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-emerald-800">{t("activeSubscriptionTitle")}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">
                    {t("activeSubscriptionMsg")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {portalLoading && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {t("manageSubscription")}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              mode={mode}
              loading={catalogLoading || checkoutPriceId === priceMap.get(`${plan.key}:${mode === "subscription" ? "subscription" : "payment"}`)?.id}
              disabled={Boolean(catalogError)}
              onSelect={() => void startCheckout(plan)}
            />
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[var(--codex-surface)]">
          <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-center">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">{t("usageTitle")}</p>
              <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-stone-100">{t("usageHint")}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {usageRules.map((rule) => (
                <div key={rule.id} className="rounded-xl bg-zinc-50 p-4 dark:bg-[var(--codex-surface)]">
                  <p className="mb-2 text-lg font-black tabular-nums text-zinc-900 dark:text-stone-100">{t(rule.valueKey, rule.valueVars)}</p>
                  <p className="text-xs font-medium leading-relaxed text-zinc-700 dark:text-stone-300">{t(rule.labelKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  mode,
  loading,
  disabled,
  onSelect,
}: {
  plan: CreditPlan;
  mode: PricingMode;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Pricing");
  const features = buildFeatures(plan, mode, t);

  return (
    <article
      className={cn(
        "relative flex min-h-[534px] flex-col rounded-2xl border bg-white p-6 transition-[box-shadow,border-color,transform] duration-200",
        plan.featured ? "border-zinc-900 shadow-lg ring-1 ring-zinc-900" : "border-zinc-200 shadow-sm"
      )}
    >
      {plan.featured ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            {t("mostPopular")}
          </span>
        </div>
      ) : null}

      <div className="mb-4 mt-2 flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            plan.featured ? "bg-zinc-900 text-white" : "bg-zinc-100 dark:bg-stone-800 text-zinc-600"
          )}
        >
          <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="flex-1 text-xl font-bold text-zinc-900 dark:text-stone-100">{t(plan.titleKey)}</h3>
        {plan.savings ? (
          <span className="ml-auto inline-flex h-14 w-14 shrink-0 rotate-[-12deg] flex-col items-center justify-center rounded-full border-2 border-dashed border-amber-300 bg-amber-50 text-amber-700">
            <span className="text-[10px] font-bold leading-none">{t("saveBadge")}</span>
            <span className="text-base font-black leading-tight">{plan.savings}%</span>
          </span>
        ) : null}
      </div>

      <div className="mb-6 flex items-baseline gap-1">
        <span className="text-4xl font-black tabular-nums text-zinc-900 dark:text-stone-100">¥{formatNumber(plan.price)}</span>
        {mode === "subscription" ? <span className="text-sm font-medium text-zinc-700 dark:text-stone-300">{t("perMonth")}</span> : null}
      </div>

      <ul className="mb-8 flex-1 space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2 text-zinc-700 dark:text-stone-300">
            <Check className={cn("h-4 w-4 shrink-0", feature.primary ? "text-zinc-900 dark:text-stone-100" : "text-zinc-300")} aria-hidden="true" />
            <span className={cn(feature.primary ? "text-sm font-semibold" : "font-medium")}>{feature.content}</span>
          </li>
        ))}
      </ul>

      {plan.enterpriseNoteKey ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-2 py-1.5 text-amber-700">
          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="text-xs font-bold">{t(plan.enterpriseNoteKey)}</span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        disabled={loading || disabled}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[15px] font-bold transition-[background-color,border-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60",
          plan.featured
            ? "bg-zinc-900 text-white shadow-md hover:bg-zinc-800"
            : "border-2 border-zinc-100 bg-white text-zinc-900 dark:text-stone-100 hover:border-zinc-200 hover:bg-zinc-50"
        )}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {mode === "subscription" ? t("startSubscription") : t("buyNow")}
      </button>
    </article>
  );
}

function NoticeCard({ notice }: { notice: CheckoutNotice }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", noticeToneClass(notice.tone))}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-black">{notice.title}</p>
        <p className="mt-1 text-xs font-semibold leading-5">{notice.message}</p>
      </div>
    </div>
  );
}

function noticeToneClass(tone: CheckoutNotice["tone"]) {
  if (tone === "success") return "border-emerald-100 bg-emerald-50 text-emerald-800";
  if (tone === "warning") return "border-amber-100 bg-amber-50 text-amber-800";
  if (tone === "danger") return "border-red-100 bg-red-50 text-red-700";
  return "border-blue-100 bg-blue-50 text-blue-800";
}

function buildPriceMap(catalog: BillingCatalogResponse | null) {
  const map = new Map<string, BillingCatalogPrice>();
  for (const product of catalog?.products || []) {
    const tierKey = product.tierKey;
    if (!tierKey) continue;
    for (const price of product.prices || []) {
      if (!price.mode) continue;
      map.set(`${tierKey}:${price.mode}`, price);
    }
  }
  return map;
}

function fallbackPriceId(planKey: string, mode: "payment" | "subscription") {
  return `price_${planKey}_${mode === "subscription" ? "monthly" : "once"}`;
}
