import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Suspense } from "react";
import { AccountCenterClient } from "@/components/account/AccountCenterClient";

export const metadata: Metadata = {
  title: "个人中心 | VastWearGen",
};

export default function AccountPage() {
  return (
    <AntdRegistry>
      <Suspense fallback={<AccountPageFallback />}>
        <AccountCenterClient />
      </Suspense>
    </AntdRegistry>
  );
}

function AccountPageFallback() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-6">
      <div className="mx-auto h-64 w-full max-w-[1460px] animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/50" />
    </main>
  );
}
