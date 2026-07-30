import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <section className="min-h-screen bg-zinc-50 px-4 py-16 sm:px-6" aria-busy="true">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center">
          <Skeleton className="mx-auto h-4 w-24 rounded-full" />
          <Skeleton className="mx-auto h-10 w-full max-w-md rounded-lg" />
          <Skeleton className="mx-auto h-4 w-full max-w-xl rounded-md" />
          <Skeleton className="mx-auto h-10 w-56 rounded-full" />
        </div>
        <div className="mb-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <PricingCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <Skeleton className="h-5 w-24 rounded-md" />
      <Skeleton className="mt-3 h-4 w-full rounded-md" />
      <Skeleton className="mt-6 h-9 w-32 rounded-md" />
      <Skeleton className="mt-5 h-10 w-full rounded-md" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 flex-1 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
