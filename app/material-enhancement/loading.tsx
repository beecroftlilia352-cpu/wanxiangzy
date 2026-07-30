import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="studio-workbench flex min-h-[calc(100dvh-64px)] flex-col lg:h-[calc(100vh-64px)] lg:flex-row" aria-busy="true" aria-live="polite">
      <aside className="hidden w-[72px] shrink-0 border-r border-border/70 lg:block" />
      <section className="w-full border-b border-border/70 p-5 lg:w-[472px] lg:border-b-0 lg:border-r" aria-label="材质增强参数加载中">
        <Skeleton className="h-7 w-28 rounded-md" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full rounded-md" />
        <div className="mt-6 space-y-5">
          {["上传原图", "上传高清服装图"].map((label) => (
            <div key={label}>
              <Skeleton className="mb-3 h-4 w-28 rounded-md" />
              <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-border bg-muted/25 p-4">
                <div className="w-full max-w-48 space-y-3">
                  <Skeleton className="mx-auto h-9 w-9 rounded-md" />
                  <Skeleton className="mx-auto h-4 w-32 rounded-md" />
                  <Skeleton className="mx-auto h-3 w-full rounded-md" />
                </div>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-md" />)}
          </div>
        </div>
      </section>
      <section className="grid min-h-[360px] flex-1 place-items-center p-6" aria-label="预览区域加载中">
        <div className="w-full max-w-[720px] space-y-4">
          <Skeleton className="mx-auto aspect-[4/3] max-h-[520px] w-full rounded-lg" />
          <Skeleton className="mx-auto h-4 w-52 rounded-md" />
        </div>
      </section>
    </div>
  );
}
