import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLoading() {
  return (
    <main className="min-h-[calc(100dvh-64px)] bg-[#f6f7fb] p-4">
      <div className="mx-auto grid h-full max-w-[1440px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="hidden rounded-lg border border-border bg-white p-4 shadow-sm lg:block">
          <Skeleton className="mb-5 h-8 w-36 rounded-md" />
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="rounded-md border border-border p-3">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="mt-2 h-3 w-full rounded-md" />
              </div>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[70vh] flex-col rounded-lg border border-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40 rounded-md" />
              <Skeleton className="h-3 w-64 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <div className="flex-1 space-y-5 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={index % 2 ? "ml-auto max-w-[72%]" : "max-w-[78%]"}>
                <Skeleton className="h-5 w-28 rounded-md" />
                <Skeleton className="mt-2 h-20 rounded-lg" />
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </section>
      </div>
    </main>
  );
}
