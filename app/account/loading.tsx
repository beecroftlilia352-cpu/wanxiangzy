/**
 * 个人中心骨架屏 — 镜像账户页结构（侧栏 + 主内容），
 * 视觉语言与 StudioModuleSkeleton 一致（studio-skeleton-shimmer）。
 */

function Block({ className }: { className: string }) {
  return <div className={`studio-skeleton-shimmer ${className}`} aria-hidden="true" />;
}

export default function AccountLoading() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-6 dark:bg-[#0c0d12]" aria-busy="true" aria-live="polite">
      <div className="mx-auto grid w-full max-w-[1460px] gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* 侧栏 */}
        <aside className="space-y-3 rounded-2xl border border-[var(--codex-border)] bg-codex-surface p-4 shadow-sm dark:border-white/10">
          <Block className="h-9 w-36 rounded-lg" />
          {Array.from({ length: 7 }).map((_, index) => (
            <Block key={index} className="h-10 w-full rounded-xl" />
          ))}
        </aside>

        {/* 主内容 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--codex-border)] bg-codex-surface p-6 shadow-sm dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Block className="h-6 w-40 rounded-lg" />
                <Block className="h-4 w-64 rounded-md" />
              </div>
              <Block className="h-10 w-28 rounded-full" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-[var(--codex-border)] bg-codex-surface p-5 shadow-sm dark:border-white/10">
                <Block className="h-4 w-16 rounded-md" />
                <Block className="mt-3 h-7 w-24 rounded-lg" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--codex-border)] bg-codex-surface p-6 shadow-sm dark:border-white/10">
            <Block className="h-5 w-32 rounded-lg" />
            {Array.from({ length: 5 }).map((_, index) => (
              <Block key={index} className="mt-4 h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
