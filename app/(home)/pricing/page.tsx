import type { Metadata } from "next";
import { PricingSection } from "@/components/pricing/PricingSection";

export const metadata: Metadata = {
  title: "购买灵点 - VastWearGen",
  description: "购买 VastWearGen AI 电商视觉灵点，支持支付宝、微信支付和订阅套餐。",
};

export default function PricingPage() {
  return <PricingSection />;
}
