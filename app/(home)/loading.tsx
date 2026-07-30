import { PageFallback, HeroFallback, MetricGridFallback, CardFallback } from "@/components/ui/page-loading";

export default function HomeLoading() {
  return (
    <PageFallback className="space-y-10 px-4 py-10 sm:px-6 lg:px-10">
      <HeroFallback showActions={false} />
      <MetricGridFallback count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardFallback title lines={4} />
        <CardFallback title lines={4} />
      </div>
      <CardFallback title lines={6} />
    </PageFallback>
  );
}
