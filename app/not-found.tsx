import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("Shared");
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <section className="w-full max-w-md rounded-2xl border border-[var(--codex-border)] bg-white/90 p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
        <p className="text-sm font-semibold text-[var(--codex-accent)]">404</p>
        <h1 className="mt-3 text-2xl font-bold text-codex-ink dark:text-white">{t("notFoundTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-codex-muted dark:text-codex-faint">
          {t("notFoundDescription")}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--codex-accent)] px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2"
        >
          {t("backHome")}
        </Link>
      </section>
    </main>
  );
}
