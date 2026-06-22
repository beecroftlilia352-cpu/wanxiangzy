import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
        <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">404</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950 dark:text-stone-100">页面不存在</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-stone-400">
          这个页面可能已移动或失效，可以回到首页重新选择功能。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
