import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountCenterClient } from "@/components/account/AccountCenterClient";

export const metadata: Metadata = {
  title: "个人中心 | VastWearGen",
};

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountPageFallback />}>
      <AccountCenterClient />
    </Suspense>
  );
}

function AccountPageFallback() {
  return (
    <main className="min-h-screen bg-[var(--codex-gradient-page)] px-4 py-6">
      <div className="mx-auto h-64 w-full max-w-[1280px] animate-pulse rounded-2xl border border-white/80 bg-white/80 shadow-lg shadow-slate-200/40" />
    </main>
  );
}
