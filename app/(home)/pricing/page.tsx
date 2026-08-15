import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PricingSection } from "@/components/pricing/PricingSection";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale().catch(() => "zh");
  const t = await getTranslations({ locale, namespace: "Pricing" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function PricingPage() {
  return <PricingSection />;
}
