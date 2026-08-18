export type BillingMode = "payment" | "subscription";
export type BillingProductKind = "credit_tier";

export type BillingPrice = {
  id: string;
  productId: string;
  mode: BillingMode;
  label: string;
  unitAmount: number;
  currency: "cny";
  interval: "month" | null;
  credits: number;
  stripePriceId: string | null;
  active: boolean;
  walletEnabled: boolean;
};

export type BillingProduct = {
  id: string;
  tierKey: string;
  kind: BillingProductKind;
  name: string;
  description: string;
  badge: string | null;
  creditAmount: number;
  bonusCredits: number;
  subscriptionBonusPercent: number;
  features: string[];
  stripeProductId: string | null;
  active: boolean;
  sortOrder: number;
  prices: BillingPrice[];
};

export type BillingCatalog = {
  products: BillingProduct[];
  config: {
    currency: "cny";
    oneTimeWalletsEnabled: boolean;
    subscriptionWalletsEnabled: false;
    subscriptionBonusPercent: number;
  };
  warnings: string[];
};

type BillingTierSeed = {
  tierKey: string;
  name: string;
  description: string;
  badge?: string;
  unitAmount: number;
  creditAmount: number;
  bonusCredits: number;
  features: string[];
};

export const BILLING_SUBSCRIPTION_BONUS_PERCENT = 5;

/** Keep operator-edited subscription entitlements within a predictable range. */
export function normalizeSubscriptionBonusPercent(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return BILLING_SUBSCRIPTION_BONUS_PERCENT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

export const BILLING_TIERS: BillingTierSeed[] = [
  {
    tierKey: "starter",
    name: "入门版",
    description: "适合轻量试用和小批量出图。",
    unitAmount: 3_500,
    creditAmount: 250,
    bonusCredits: 0,
    features: ["250 灵点", "适合体验核心生成能力", "支持所有基础模块"],
  },
  {
    tierKey: "pro",
    name: "专业版",
    description: "适合稳定日常生产。",
    badge: "热门",
    unitAmount: 14_000,
    creditAmount: 1_000,
    bonusCredits: 200,
    features: ["1,000 灵点 + 赠送 200", "适合多模块连续生成", "更高性价比"],
  },
  {
    tierKey: "business",
    name: "企业版",
    description: "适合团队批量生成和电商素材生产。",
    badge: "推荐",
    unitAmount: 70_000,
    creditAmount: 5_000,
    bonusCredits: 2_000,
    features: ["5,000 灵点 + 赠送 2,000", "适合批量商品套图", "团队运营更稳"],
  },
  {
    tierKey: "premium",
    name: "豪华版",
    description: "适合高频生产和大规模素材工作流。",
    unitAmount: 350_000,
    creditAmount: 25_000,
    bonusCredits: 13_000,
    features: ["25,000 灵点 + 赠送 13,000", "适合高频生成", "最佳单灵点成本"],
  },
];

export function totalOneTimeCredits(tier: Pick<BillingTierSeed, "creditAmount" | "bonusCredits">) {
  return tier.creditAmount + tier.bonusCredits;
}

export function subscriptionCreditsFor(totalCredits: number, bonusPercent = BILLING_SUBSCRIPTION_BONUS_PERCENT) {
  return Math.round(totalCredits * (1 + bonusPercent / 100));
}

export function seededBillingProducts(): BillingProduct[] {
  return BILLING_TIERS.map((tier, index) => {
    const productId = `prod_${tier.tierKey}`;
    const oneTimeCredits = totalOneTimeCredits(tier);
    const subscriptionCredits = subscriptionCreditsFor(oneTimeCredits);
    return {
      id: productId,
      tierKey: tier.tierKey,
      kind: "credit_tier",
      name: tier.name,
      description: tier.description,
      badge: tier.badge ?? null,
      creditAmount: tier.creditAmount,
      bonusCredits: tier.bonusCredits,
      subscriptionBonusPercent: BILLING_SUBSCRIPTION_BONUS_PERCENT,
      features: tier.features,
      stripeProductId: null,
      active: true,
      sortOrder: index + 1,
      prices: [
        {
          id: `price_${tier.tierKey}_once`,
          productId,
          mode: "payment",
          label: "一次性购买",
          unitAmount: tier.unitAmount,
          currency: "cny",
          interval: null,
          credits: oneTimeCredits,
          stripePriceId: null,
          active: true,
          walletEnabled: true,
        },
        {
          id: `price_${tier.tierKey}_monthly`,
          productId,
          mode: "subscription",
          label: "月订阅",
          unitAmount: tier.unitAmount,
          currency: "cny",
          interval: "month",
          credits: subscriptionCredits,
          stripePriceId: null,
          active: true,
          walletEnabled: false,
        },
      ],
    };
  });
}

export const SEEDED_BILLING_CATALOG: BillingCatalog = {
  products: seededBillingProducts(),
  config: {
    currency: "cny",
    oneTimeWalletsEnabled: true,
    subscriptionWalletsEnabled: false,
    subscriptionBonusPercent: BILLING_SUBSCRIPTION_BONUS_PERCENT,
  },
  warnings: [],
};

export function findSeededPrice(priceId: string) {
  for (const product of SEEDED_BILLING_CATALOG.products) {
    const price = product.prices.find((item) => item.id === priceId);
    if (price) return { product, price };
  }
  return null;
}

export function formatCny(unitAmount: number) {
  return `¥${(unitAmount / 100).toLocaleString("zh-CN", {
    maximumFractionDigits: 0,
  })}`;
}
