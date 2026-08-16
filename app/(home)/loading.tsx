/**
 * 首页骨架屏 — 镜像 home-marketing-page 结构（hero / 合作品牌 / 特性行 / 场景卡 / 用户评价 / 底部 CTA），
 * 视觉语言与 StudioModuleSkeleton 一致（studio-skeleton-shimmer + codex 面板）。
 */

function Block({ className }: { className: string }) {
  return <div className={`studio-skeleton-shimmer ${className}`} aria-hidden="true" />;
}

export default function HomeLoading() {
  return (
    <div className="home-marketing-page min-h-screen bg-codex-surface text-codex-ink" aria-busy="true" aria-live="polite">
      {/* Hero — 与 .home-landing-hero 同尺寸节奏 */}
      <section className="relative overflow-hidden bg-[#e8e9f7]">
        <div className="mx-auto flex min-h-[640px] max-w-[1440px] flex-col items-center px-5 pt-[88px] text-center sm:min-h-[760px] sm:px-8 sm:pt-[108px] md:min-h-[960px] md:pt-[138px] lg:min-h-[1100px] lg:px-10 lg:pt-[156px] xl:min-h-[1240px] xl:pt-[176px]">
          <Block className="h-[52px] w-[52px] rounded-xl" />
          <Block className="mt-8 h-12 w-[min(680px,85%)] rounded-xl sm:h-[56px]" />
          <Block className="mt-7 h-7 w-[min(720px,90%)] rounded-lg" />
          <Block className="mt-3 h-6 w-[min(560px,74%)] rounded-lg" />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Block className="h-12 w-40 rounded-full" />
            <Block className="h-12 w-32 rounded-full" />
          </div>
        </div>
      </section>

      <main className="bg-codex-surface">
        {/* 合作品牌带 */}
        <section className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-8 px-5 py-10 sm:px-8 lg:px-10">
          {Array.from({ length: 5 }).map((_, index) => (
            <Block key={index} className="h-8 w-24 rounded-lg" />
          ))}
        </section>

        {/* 特性行 */}
        <section className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[760px] space-y-3 text-center">
            <Block className="mx-auto h-8 w-64 rounded-lg" />
            <Block className="mx-auto h-5 w-full max-w-[560px] rounded-md" />
          </div>
          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Block key={index} className="h-72 rounded-3xl" />
            ))}
          </div>
        </section>

        {/* 场景卡 */}
        <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-10">
          <Block className="mx-auto h-8 w-72 rounded-lg" />
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-3xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] p-2 shadow-sm dark:border-white/10">
                <Block className="aspect-[1.16] rounded-2xl" />
                <Block className="mx-4 mt-4 h-5 w-32 rounded-md" />
                <Block className="mx-4 mb-4 mt-3 h-4 w-40 rounded-md" />
              </div>
            ))}
          </div>
        </section>

        {/* 用户评价 */}
        <section className="mx-auto max-w-[1440px] px-5 pb-28 sm:px-8 lg:px-10">
          <Block className="mx-auto h-8 w-72 rounded-lg" />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-3xl border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] p-6 shadow-sm dark:border-white/10">
                <Block className="h-11 w-11 rounded-full" />
                <Block className="mt-8 h-4 w-full rounded-md" />
                <Block className="mt-3 h-4 w-5/6 rounded-md" />
                <Block className="mt-16 h-3 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </section>

        {/* 底部 CTA */}
        <section className="mx-auto max-w-[1440px] px-5 pb-20 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-[900px] flex-col items-center rounded-[34px] border border-[var(--codex-border)] bg-[var(--codex-surface-strong)] px-6 py-20 text-center shadow-sm dark:border-white/10">
            <Block className="h-8 w-80 max-w-full rounded-lg" />
            <Block className="mt-6 h-5 w-[min(660px,90%)] rounded-md" />
            <Block className="mt-9 h-12 w-40 rounded-full" />
          </div>
        </section>
      </main>
    </div>
  );
}
