import { Suspense } from "react";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import { AdminDashboardData } from "@/components/admin/AdminDashboardData";
import { AdminDashboardSkeleton } from "@/components/admin/AdminDashboardSkeleton";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const dayOptions = [1, 7, 14, 30];

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const days = normalizeDays(getSearchParam(params.days));

  return (
    <AdminDashboardShell days={days}>
      <Suspense fallback={<AdminDashboardSkeleton />}>
        <AdminDashboardData days={days} />
      </Suspense>
    </AdminDashboardShell>
  );
}

function normalizeDays(value: string) {
  const parsed = Number(value);
  return dayOptions.includes(parsed) ? parsed : 7;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
