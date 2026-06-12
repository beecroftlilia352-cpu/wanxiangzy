import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountCenterClient } from "@/components/account/AccountCenterClient";
import { Skeleton } from "@/components/ui/skeleton";

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
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-6">
      <div className="mx-auto grid w-full max-w-[1460px] gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <Skeleton className="h-9 w-36 rounded-md" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </aside>
        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <Skeleton className="h-6 w-36 rounded-md" />
          <Skeleton className="mt-5 h-32 w-full rounded-lg" />
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-md" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
