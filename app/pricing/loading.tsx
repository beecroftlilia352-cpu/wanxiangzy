export default function PricingLoading() {
  return (
    <section className="min-h-screen bg-zinc-50 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-12 h-28 max-w-2xl animate-pulse rounded-3xl bg-white" />
        <div className="mb-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[534px] animate-pulse rounded-2xl border border-zinc-200 bg-white" />
          ))}
        </div>
      </div>
    </section>
  );
}
