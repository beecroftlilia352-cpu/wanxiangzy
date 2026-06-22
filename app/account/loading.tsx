import { CardFallback, HeroFallback, ListFallback, PageFallback, TableFallback } from "@/components/ui/page-loading";

export default function AccountLoading() {
  return (
    <PageFallback className="space-y-4 p-4 sm:p-6">
      <HeroFallback />
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,2.1fr)]">
        <ListFallback count={6} withAvatar />
        <div className="space-y-4">
          <TableFallback rows={5} columns={4} />
          <CardFallback title lines={4} />
        </div>
      </div>
    </PageFallback>
  );
}
