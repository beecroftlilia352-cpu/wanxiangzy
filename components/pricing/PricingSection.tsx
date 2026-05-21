"use client";

import { useMemo, useState } from "react";
import { Check, CircleDollarSign, Crown, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type PricingMode = "credits" | "subscription";

type CreditPlan = {
  title: string;
  price: number;
  baseCredits: number;
  bonusCredits: number;
  savings?: number;
  featured?: boolean;
  enterpriseNote?: string;
};

const CREDIT_PLANS: CreditPlan[] = [
  { title: "入门版", price: 35, baseCredits: 250, bonusCredits: 0 },
  { title: "专业版", price: 140, baseCredits: 1000, bonusCredits: 200, savings: 17 },
  {
    title: "企业版",
    price: 700,
    baseCredits: 5000,
    bonusCredits: 2000,
    savings: 29,
    featured: true,
  },
  {
    title: "豪华版",
    price: 3500,
    baseCredits: 25000,
    bonusCredits: 13000,
    savings: 34,
    enterpriseNote: "支持开通转积分给子账号功能，提供专属产品支持群",
  },
];

const CREDIT_COSTS = {
  nanoBanana: 3,
  nanoBanana2: 4,
  nanoBananaPro: 5,
  gptImage2: 4,
  detailSet: 30,
};

const usageRules = [
  { value: "3 积分/张", label: "Nano Banana 图片" },
  { value: "4 积分/张", label: "Nano Banana 2 / GPT Image 2 图片" },
  { value: "5 积分/张", label: "Nano Banana Pro 图片" },
  { value: "30 积分/套", label: "详情页生成" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.floor(value));
}

function getTotalCredits(plan: CreditPlan, mode: PricingMode) {
  const total = plan.baseCredits + plan.bonusCredits;
  return mode === "subscription" ? Math.floor(total * 1.05) : total;
}

function getCreditLine(plan: CreditPlan, mode: PricingMode) {
  if (mode === "subscription") {
    return <>{formatNumber(getTotalCredits(plan, mode))} 积分</>;
  }

  if (plan.bonusCredits <= 0) {
    return <>{formatNumber(plan.baseCredits)} 积分</>;
  }

  return (
    <>
      {formatNumber(plan.baseCredits)} 积分
      <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600">
        + <Sparkles className="h-3 w-3" /> 赠送{formatNumber(plan.bonusCredits)}积分
      </span>
    </>
  );
}

function buildFeatures(plan: CreditPlan, mode: PricingMode) {
  const credits = getTotalCredits(plan, mode);

  return [
    { primary: true, content: getCreditLine(plan, mode) },
    { content: `${formatNumber(credits / CREDIT_COSTS.nanoBanana2)} 张 Nano Banana 2 图片` },
    { content: `${formatNumber(credits / CREDIT_COSTS.nanoBananaPro)} 张 Nano Banana Pro 图片` },
    { content: `${formatNumber(credits / CREDIT_COSTS.gptImage2)} 张 GPT Image 2 图片` },
    { content: `${formatNumber(credits / CREDIT_COSTS.nanoBanana)} 张 Nano Banana 图片` },
    { content: `${formatNumber(credits / CREDIT_COSTS.detailSet)} 套详情页` },
    { content: mode === "subscription" ? "每月自动到账，随时使用" : "不过期，随时使用" },
    { content: mode === "subscription" ? "支持随时取消订阅" : "一次购买，长期有效" },
  ];
}

export function PricingSection() {
  const [mode, setMode] = useState<PricingMode>("credits");
  const plans = useMemo(() => CREDIT_PLANS, []);

  return (
    <section className="min-h-screen bg-zinc-50 px-4 py-16 sm:px-6" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">AI 电商视觉积分</p>
          <h1 id="pricing-title" className="mb-4 text-4xl font-black tracking-tight text-zinc-900">
            赋能您的电商视觉
          </h1>
          <p className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-1 text-base font-medium leading-relaxed text-zinc-500">
            <span>已服务</span>
            <span className="text-2xl font-black leading-none text-zinc-900">50000+</span>
            <span>电商商家，主图点击率平均提升 25%</span>
          </p>
        </div>

        <div className="mx-auto mb-12 grid h-14 w-full max-w-sm grid-cols-2 rounded-2xl bg-zinc-100 p-1">
          <button
            type="button"
            aria-pressed={mode === "credits"}
            onClick={() => setMode("credits")}
            className={cn(
              "group order-1 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-zinc-500 transition-all",
              mode === "credits" && "bg-white text-zinc-900 shadow-sm"
            )}
          >
            <Zap className="h-4 w-4" />
            <span>购买积分</span>
            <span
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 border-l border-zinc-200 pl-2 transition-opacity",
                mode === "credits" ? "opacity-95" : "opacity-60"
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#1677ff] text-[10px] font-black text-white">支</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#2aae67] text-[10px] font-black text-white">微</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "subscription"}
            onClick={() => setMode("subscription")}
            className={cn(
              "order-2 inline-flex items-center justify-center rounded-xl text-sm font-bold text-zinc-500 transition-all",
              mode === "subscription" && "bg-white text-zinc-900 shadow-sm"
            )}
          >
            <Crown className="mr-2 h-4 w-4" />
            订阅套餐
            <span className="ml-1 text-amber-700">+5%</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.title} plan={plan} mode={mode} />
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-center">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">积分消耗</p>
              <h2 className="text-xl font-black tracking-tight text-zinc-900">先按参考规则上线，后续再优化</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {usageRules.map((rule) => (
                <div key={rule.value} className="rounded-xl bg-zinc-50 p-4">
                  <p className="mb-2 text-lg font-black text-zinc-900">{rule.value}</p>
                  <p className="text-xs font-medium leading-relaxed text-zinc-500">{rule.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, mode }: { plan: CreditPlan; mode: PricingMode }) {
  const features = buildFeatures(plan, mode);

  return (
    <article
      className={cn(
        "relative flex min-h-[534px] flex-col rounded-2xl border bg-white p-6 transition-all",
        plan.featured ? "border-zinc-900 shadow-lg ring-1 ring-zinc-900" : "border-zinc-200 shadow-sm"
      )}
    >
      {plan.featured ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            最受欢迎
          </span>
        </div>
      ) : null}

      <div className="mb-4 mt-2 flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            plan.featured ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
          )}
        >
          <CircleDollarSign className="h-5 w-5" />
        </div>
        <h3 className="flex-1 text-xl font-bold text-zinc-900">{plan.title}</h3>
        {plan.savings ? (
          <span className="ml-auto inline-flex h-14 w-14 shrink-0 rotate-[-12deg] flex-col items-center justify-center rounded-full border-2 border-dashed border-amber-300 bg-amber-50 text-amber-700">
            <span className="text-[10px] font-bold leading-none">立省</span>
            <span className="text-base font-black leading-tight">{plan.savings}%</span>
          </span>
        ) : null}
      </div>

      <div className="mb-6 flex items-baseline gap-1">
        <span className="text-4xl font-black text-zinc-900">¥{formatNumber(plan.price)}</span>
        {mode === "subscription" ? <span className="text-sm font-medium text-zinc-500">/连续包月</span> : null}
      </div>

      <ul className="mb-8 flex-1 space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2 text-zinc-700">
            <Check className={cn("h-4 w-4 shrink-0", feature.primary ? "text-zinc-900" : "text-zinc-300")} />
            <span className={cn(feature.primary ? "text-sm font-semibold" : "font-medium")}>{feature.content}</span>
          </li>
        ))}
      </ul>

      {plan.enterpriseNote ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-2 py-1.5 text-amber-700">
          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="text-xs font-bold">{plan.enterpriseNote}</span>
        </div>
      ) : null}

      <button
        type="button"
        className={cn(
          "w-full rounded-xl py-4 text-[15px] font-bold transition-all",
          plan.featured
            ? "bg-zinc-900 text-white shadow-md hover:bg-zinc-800"
            : "border-2 border-zinc-100 bg-white text-zinc-900 hover:border-zinc-200 hover:bg-zinc-50"
        )}
      >
        立即选择
      </button>
    </article>
  );
}
