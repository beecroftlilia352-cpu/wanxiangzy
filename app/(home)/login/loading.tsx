/**
 * 登录页骨架屏 — 镜像登录 shell 结构（左侧 AuthHero 大卡 + 右侧表单卡），
 * 视觉语言与 StudioModuleSkeleton 一致（studio-skeleton-shimmer）。
 */

function Block({ className }: { className: string }) {
  return <div className={`studio-skeleton-shimmer ${className}`} aria-hidden="true" />;
}

export default function LoginLoading() {
  return (
    <div
      className="mx-auto grid min-h-[calc(100dvh-128px)] max-w-6xl items-start gap-8 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:pt-0"
      aria-busy="true"
      aria-live="polite"
    >
      {/* AuthHero — 桌面端才展示 */}
      <div className="hidden lg:block">
        <div className="rounded-[34px] border border-[var(--codex-border)] bg-codex-surface p-8 shadow-sm dark:border-white/10">
          <Block className="h-9 w-28 rounded-lg" />
          <Block className="mt-10 h-10 w-80 max-w-full rounded-xl" />
          <Block className="mt-5 h-4 w-[420px] max-w-full rounded-md" />
          <Block className="mt-3 h-4 w-[360px] max-w-full rounded-md" />
          <Block className="mt-10 h-64 w-full rounded-2xl" />
        </div>
      </div>

      {/* 表单卡 */}
      <div className="mx-auto w-full max-w-[350px] rounded-3xl border border-[var(--codex-border)] bg-codex-surface p-6 shadow-sm sm:max-w-[440px] sm:p-8 dark:border-white/10">
        <Block className="h-7 w-40 rounded-lg" />
        <Block className="mt-3 h-4 w-56 rounded-md" />
        <Block className="mt-8 h-11 w-full rounded-xl" />
        <Block className="mt-4 h-11 w-full rounded-xl" />
        <Block className="mt-6 h-11 w-full rounded-full" />
        <Block className="mx-auto mt-6 h-4 w-48 rounded-md" />
      </div>
    </div>
  );
}
