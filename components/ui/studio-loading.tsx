import { CardFallback, HeroFallback, ListFallback, MetricGridFallback, PageFallback, TableFallback } from "@/components/ui/page-loading";

/**
 * Generic loading state for studio / app routes (model, pose, product-set,
 * etc.). Pages are heavily client-side, so this provides a quick visual
 * confirmation that the route is mounting while the page hydrates.
 */
export function StudioLoadingFallback() {
  return (
    <PageFallback className="space-y-4 p-4 sm:p-6">
      <HeroFallback showActions={false} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricGridFallback count={4} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CardFallback title lines={5} />
        <ListFallback count={5} />
      </div>
      <TableFallback rows={4} columns={6} />
    </PageFallback>
  );
}
