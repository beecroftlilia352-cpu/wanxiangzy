import { CardFallback, ChartFallback, HeroFallback, ListFallback, MetricGridFallback, PageFallback, TableFallback } from "@/components/ui/page-loading";

export default function AdminSubLoading() {
  return (
    <PageFallback className="space-y-4">
      <HeroFallback />
      <MetricGridFallback count={4} className="!grid-cols-1 sm:!grid-cols-2 lg:!grid-cols-4" />
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFallback variant="line" />
        <ChartFallback variant="bar" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <TableFallback rows={6} columns={5} />
        <ListFallback count={5} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <CardFallback title lines={4} />
        <CardFallback title lines={4} />
      </div>
    </PageFallback>
  );
}
