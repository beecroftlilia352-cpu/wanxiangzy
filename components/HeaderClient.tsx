"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  CircleHelp,
  Coins,
  CreditCard,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  clearCachedProfile,
  clearCachedProfileCredits,
  createClient,
  getCachedProfile,
  getCachedProfileCredits,
  setCachedProfileCredits,
  subscribeToProfileCredits,
} from "@/lib/supabase/client";
import { VISIBLE_TOP_MODULES, getActiveTopModule } from "@/lib/navigation";
import { codexTheme } from "@/lib/design/codex-theme";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

type HeaderAccountState = {
  authReady: boolean;
  creditsReady: boolean;
  credits: number | null;
  email: string | null;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
};

const marketingNav = [
  { labelKey: "Header.nav.products", href: "/#features" },
  { labelKey: "Header.nav.modelLibrary", href: "/model" },
  { labelKey: "Header.nav.pricing", href: "/pricing" },
  { labelKey: "Header.nav.cases", href: "/#testimonials" },
  { labelKey: "Header.nav.resources", href: "/general-image" },
];

export function HeaderClient() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  if (pathname === "/") {
    return <MarketingHeaderWithAccount overlay />;
  }

  if (pathname.startsWith("/pricing")) {
    return <MarketingHeaderWithAccount />;
  }

  return <AppHeader pathname={pathname} />;
}

function useHeaderAccount(): HeaderAccountState {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [creditsReady, setCreditsReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const loadedCreditsForUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileFromApi() {
      const payload = await getCachedProfile();
      if (cancelled || !payload?.user?.id) return false;

      loadedCreditsForUserRef.current = payload.user.id;
      setEmail(payload.user.email ?? null);
      setCredits(payload.credits ?? 0);
      setCachedProfileCredits(payload.user.id, payload.credits ?? 0);
      setAuthReady(true);
      setCreditsReady(true);
      return true;
    }

    async function loadUserCredits(user: { id: string; email?: string | null }) {
      setEmail(user.email ?? null);
      setAuthReady(true);
      setCreditsReady(false);
      loadedCreditsForUserRef.current = user.id;

      const apiLoaded = await loadProfileFromApi();
      if (apiLoaded) return;

      const profileCredits = await getCachedProfileCredits(user.id);
      if (!cancelled && loadedCreditsForUserRef.current === user.id) {
        setCredits(profileCredits);
        setCreditsReady(true);
      }
    }

    loadProfileFromApi()
      .then((loaded) => {
        if (loaded || cancelled) return undefined;
        return supabase.auth.getUser();
      })
      .then((result) => {
        if (!result || cancelled) return;
        const { data } = result;
        if (data.user) {
          loadUserCredits(data.user);
        } else {
          setAuthReady(true);
          setCreditsReady(true);
        }
      })
      .catch(() => {
        setAuthReady(true);
        setCreditsReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadUserCredits(session.user);
      } else {
        clearCachedProfile();
        clearCachedProfileCredits();
        loadedCreditsForUserRef.current = null;
        setEmail(null);
        setCredits(null);
        setAuthReady(true);
        setCreditsReady(true);
      }
    });

    const unsubscribeCredits = subscribeToProfileCredits(({ userId, credits: nextCredits }) => {
      if (loadedCreditsForUserRef.current === userId) {
        setCredits(nextCredits);
        setCreditsReady(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeCredits();
      subscription.unsubscribe();
    };
  }, [supabase]);

  const onLogout = async () => {
    setIsLoggingOut(true);
    clearCachedProfile();
    clearCachedProfileCredits();
    setEmail(null);
    setCredits(null);
    setCreditsReady(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch("/api/logout", { method: "POST", cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        console.warn("Logout endpoint returned non-OK status:", response.status);
      }
    } catch (error) {
      // Logged but not surfaced: the redirect below ensures the user still
      // reaches the login page, and an interactive toast would flash for
      // a single frame before the navigation tears the DOM down.
      console.warn("Logout endpoint request failed:", error);
    } finally {
      window.clearTimeout(timeout);
    }
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    clearSupabaseLocalStorage();
    window.location.replace("/login");
  };

  return { authReady, creditsReady, credits, email, isLoggingOut, onLogout };
}

function MarketingHeaderWithAccount({ overlay = false }: { overlay?: boolean }) {
  const account = useHeaderAccount();

  return <MarketingHeader account={account} overlay={overlay} />;
}

function MarketingHeader({ account, overlay }: { account: HeaderAccountState; overlay: boolean }) {
  const t = useTranslations("Header");
  const tAny = useTranslations(); // 数据键全路径（Header.nav.* / Header.modules.*），用全局 t 解析
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const threshold = overlay ? 12 : 96;
    const updateScrolled = () => {
      const nextScrolled = window.scrollY > threshold;
      if (scrolledRef.current === nextScrolled) return;
      scrolledRef.current = nextScrolled;
      setScrolled(nextScrolled);
    };
    const requestUpdate = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateScrolled();
      });
    };

    updateScrolled();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [overlay]);

  return (
    <header
      className={`home-marketing-header z-50 ${overlay ? "home-marketing-header-overlay" : "sticky top-0"} ${
        scrolled ? "home-marketing-header-scrolled" : ""
      }`}
    >
      <div className="flex h-16 w-full items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="home-marketing-logo shrink-0 py-2 text-[18px] font-semibold leading-none"
          aria-label={t("homeAria")}
        >
          Pixel Diffusion
        </Link>

        <nav className="home-marketing-nav hidden flex-1 items-center gap-8 pl-4 text-[14px] font-semibold leading-none lg:flex" aria-label={t("mainNavAria")}>
          {marketingNav.map((item) => (
            <Link key={item.labelKey} href={item.href} prefetch={false} className="transition-colors">
              {tAny(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="home-marketing-actions flex shrink-0 items-center gap-3 text-[14px] font-semibold leading-none">
          <LanguageSwitcher />
          <ThemeToggle className="h-10 w-10" />
          <MarketingAccountActions {...account} />
          <Link href="/create" className="home-trial-pill hidden h-10 items-center gap-1.5 rounded-full px-5 transition sm:inline-flex">
            {t("accountMenu.workspace")}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <MarketingMobileMenu />
        </div>
      </div>
    </header>
  );
}

function MarketingAccountActions({
  authReady,
  creditsReady,
  credits,
  email,
  isLoggingOut,
  onLogout,
}: HeaderAccountState) {
  const t = useTranslations("Header");
  if (!authReady) {
    return (
      <span className="home-login-pill hidden h-10 w-[92px] items-center justify-center rounded-full px-5 transition sm:inline-flex">
        <span className="h-3 w-10 animate-pulse rounded-full bg-current opacity-20" />
      </span>
    );
  }

  if (!email) {
    return (
      <Link href="/login" className="home-login-pill hidden h-10 items-center gap-1 rounded-full px-5 transition sm:inline-flex">
        {t("login")}
        <ChevronDown className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="home-login-pill hidden h-10 items-center gap-1.5 rounded-full px-4 transition sm:inline-flex">
          <Coins className="h-3.5 w-3.5" />
          {creditsReady ? <span>{credits ?? "--"}</span> : <span className="h-3 w-5 animate-pulse rounded bg-current opacity-20" />}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="mac-surface z-[80] min-w-[180px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/50 dark:border-stone-700 dark:bg-[var(--codex-surface)] dark:shadow-black/40"
      >
        <AccountMenuHeader email={email} credits={credits} creditsReady={creditsReady} />
        <AccountMenuLink href="/account" icon={UserRound} label={t("accountMenu.account")} />
        <AccountMenuLink href="/account?tab=credits" icon={Coins} label={t("accountMenu.credits")} />
        <AccountMenuLink href="/account?tab=orders" icon={CreditCard} label={t("accountMenu.orders")} />
        <AccountMenuLink href="/account?tab=help" icon={CircleHelp} label={t("accountMenu.help")} />
        <AccountMenuLink href="/account?tab=messages" icon={Bell} label={t("accountMenu.messages")} />
        <AccountMenuLink href="/account?tab=feedback" icon={MessageSquare} label={t("accountMenu.feedback")} />
        <DropdownMenuSeparator className="my-1 h-px bg-slate-100 dark:bg-stone-800" />
        <AccountMenuLink href="/history" icon={ArrowUpRight} label={t("accountMenu.works")} />
        <AccountMenuLink href="/create" icon={Home} label={t("accountMenu.workspace")} />
        <DropdownMenuItem
          disabled={isLoggingOut}
          onSelect={(event) => {
            event.preventDefault();
            onLogout();
          }}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:text-slate-950 data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-950 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:text-stone-200 dark:hover:bg-stone-800 dark:hover:text-white dark:focus:bg-stone-800 dark:focus:text-white dark:data-[highlighted]:bg-stone-800 dark:data-[highlighted]:text-white"
        >
          <LogOut className="h-4 w-4" />
          {isLoggingOut ? t("loggingOut") : t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarketingMobileMenu() {
  const t = useTranslations("Header");
  const tAny = useTranslations(); // 数据键全路径（Header.nav.* / Header.modules.*），用全局 t 解析
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="home-menu-pill inline-flex h-10 w-10 items-center justify-center rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.18)] lg:hidden"
          aria-label={t("openNavAria")}
        >
          <Menu className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="z-[80] min-w-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-300/45 dark:border-stone-700 dark:bg-[var(--codex-surface)] dark:shadow-black/40"
      >
        {marketingNav.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              prefetch={false}
              className="flex items-center rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:text-slate-950 data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-950 dark:text-stone-200 dark:hover:bg-stone-800 dark:hover:text-white dark:focus:bg-stone-800 dark:focus:text-white dark:data-[highlighted]:bg-stone-800 dark:data-[highlighted]:text-white"
            >
              {tAny(item.labelKey)}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link
            href="/create"
            prefetch={false}
            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-black text-[var(--codex-accent)] outline-none transition hover:bg-[rgba(91,124,255,0.1)] focus:bg-[rgba(91,124,255,0.1)] data-[highlighted]:bg-[rgba(91,124,255,0.1)] dark:text-[#9db4ff]"
          >
            {t("accountMenu.workspace")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppHeader({ pathname }: { pathname: string }) {
  const [locationSearch, setLocationSearch] = useState("");
  const activeModule =
    pathname === "/agent" && new URLSearchParams(locationSearch).get("intent") === "video"
      ? "aiVideo"
      : getActiveTopModule(pathname);
  const isLoginPage = pathname === "/login";
  const { authReady, creditsReady, credits, email, isLoggingOut, onLogout } = useHeaderAccount();

  useEffect(() => {
    setLocationSearch(window.location.search);
  }, [pathname]);

  return (
    <header className="studio-app-header mac-toolbar sticky top-0 z-50">
      <div className="studio-app-header-inner flex min-h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="studio-app-header-leading flex min-w-0 items-center gap-5">
          <BrandMark />
          <DesktopTopNav activeModule={activeModule} />
        </div>

        <div className="studio-header-actions flex shrink-0 items-center gap-1.5">
          <div className="xl:hidden">
            <MobileModuleMenu activeModule={activeModule} />
          </div>
          <LanguageSwitcher />
          <ThemeToggle className="h-10 w-10" />
          <UserCreditActions
            authReady={authReady}
            creditsReady={creditsReady}
            credits={credits}
            email={email}
            isLoginPage={isLoginPage}
            isLoggingOut={isLoggingOut}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  const t = useTranslations("Header");
  return (
    <Link href="/" className="studio-brand-mark flex min-w-0 items-center gap-3" aria-label={t("brandHomeAria")}>
      <span className="studio-brand-logo relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/88 shadow-sm dark:border-stone-700 dark:bg-stone-800/90">
        <Image
          src={codexTheme.brand.logo}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
          priority
          aria-hidden="true"
        />
      </span>
      <span className="studio-brand-copy hidden min-w-0 sm:block">
        <span className="block truncate text-sm font-black text-codex-ink sm:text-[15px]">
          {codexTheme.brand.name}
        </span>
        <span className="studio-brand-subtitle block truncate text-[11px] font-semibold text-codex-muted">
          {codexTheme.brand.subtitle}
        </span>
      </span>
    </Link>
  );
}

function DesktopTopNav({ activeModule }: { activeModule: string }) {
  const t = useTranslations("Header");
  const tAny = useTranslations(); // 数据键全路径（Header.nav.* / Header.modules.*），用全局 t 解析
  return (
    <nav className="studio-surface-toolbar hidden items-center gap-1 p-1 xl:flex" aria-label={t("mainNavAria")}>
      {VISIBLE_TOP_MODULES.map((item) => {
        const active = activeModule === item.key;
        const Icon = item.icon;
        const className = `relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-black transition ${
          active
            ? "bg-[rgba(91,124,255,0.12)] text-[var(--codex-accent)] shadow-sm ring-1 ring-[rgba(91,124,255,0.3)] dark:bg-[rgba(91,140,255,0.18)] dark:text-[#aeb8ff] dark:ring-[rgba(91,140,255,0.45)]"
            : "text-codex-muted hover:bg-white/72 hover:text-codex-ink dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
        }`;

        if (item.comingSoon) {
          return (
            <button
              key={item.key}
              type="button"
              disabled
              title={t("comingSoon")}
              className={`${className} cursor-not-allowed opacity-55`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.labelKey ? tAny(item.labelKey) : item.label}
              <span className="ml-0.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-codex-faint">
                {t("comingSoon")}
              </span>
            </button>
          );
        }

        return (
          <Link key={item.key} href={item.href} className={className} aria-current={active ? "page" : undefined}>
            <Icon className="h-3.5 w-3.5" />
            <span className="relative inline-flex">
              {item.labelKey ? tAny(item.labelKey) : item.label}
              {item.badge && (
                <span
                  aria-hidden="true"
                  className="absolute -right-3 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-1.5 text-[9px] font-black leading-none tracking-tight text-white ring-2 ring-white/90 dark:ring-stone-900/80"
                >
                  {item.badge}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserCreditActions({
  authReady,
  creditsReady,
  credits,
  email,
  isLoginPage,
  isLoggingOut,
  onLogout,
}: {
  authReady: boolean;
  creditsReady: boolean;
  credits: number | null;
  email: string | null;
  isLoginPage: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const t = useTranslations("Header");
  if (isLoginPage) {
    return (
      <Link href="/" className="studio-button studio-button-compact">
        <Home className="h-3.5 w-3.5" />
        {t("homePage")}
      </Link>
    );
  }

  if (!authReady) {
    return <span className="studio-status-badge">{t("login")}</span>;
  }

  if (!email) {
    return (
      <Link href="/login" className="codex-primary-action flex h-9 shrink-0 items-center rounded-full px-4 text-xs font-bold text-white">
        {t("login")}
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/pricing"
        className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--codex-accent)] px-3 text-xs font-black text-white shadow-[0_4px_14px_rgba(91,124,255,0.3)] transition hover:-translate-y-0.5 hover:opacity-90 dark:bg-[rgba(91,140,255,0.85)] sm:inline-flex"
        title={t("topUp")}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {t("topUp")}
      </Link>
      <Link
        href="/account?tab=credits"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[rgba(91,124,255,0.3)] bg-[rgba(91,124,255,0.1)] px-3 text-xs font-black text-[var(--codex-accent)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[rgba(91,124,255,0.16)] dark:border-[rgba(91,140,255,0.4)] dark:bg-[rgba(91,140,255,0.14)] dark:text-[#aeb8ff] dark:hover:bg-[rgba(91,140,255,0.22)]"
        title={t("creditsAria")}
      >
        <Coins className="h-3.5 w-3.5" />
        {creditsReady ? <span>{credits ?? "--"}</span> : <span className="h-3 w-5 animate-pulse rounded bg-slate-200 dark:bg-white/10" />}
      </Link>
      <HeaderHelpDropdown />
      <AccountAvatarDropdown
        email={email}
        credits={credits}
        creditsReady={creditsReady}
        isLoggingOut={isLoggingOut}
        onLogout={onLogout}
      />
    </>
  );
}

function AccountAvatarDropdown({
  email,
  credits,
  creditsReady,
  isLoggingOut,
  onLogout,
}: {
  email: string;
  credits: number | null;
  creditsReady: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dbe6ff] text-[#6d8fe8] shadow-sm ring-1 ring-[#c8d7ff] transition hover:bg-[#cfddff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(91,124,255,0.18)]"
          title={t("openAccountCenter")}
          aria-label={t("openAccountMenuAria")}
          aria-expanded={open}
        >
          <Avatar className="size-8 bg-[#dbe6ff] text-[#6d8fe8]">
            <AvatarFallback className="bg-[#dbe6ff] text-xs font-black text-[#6d8fe8]">
              {getAvatarFallback(email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="z-[80] w-[272px] overflow-hidden rounded-md border border-slate-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
      >
        <AccountMenuHeader email={email} credits={credits} creditsReady={creditsReady} />
        <AccountMenuBanner />
        <AccountMenuLink href="/account" icon={UserRound} label={t("accountMenu.account")} />
        <AccountMenuLink href="/pricing" icon={CreditCard} label={t("accountMenu.topUp")} />
        <AccountMenuLink href="/account?tab=credits" icon={Coins} label={t("accountMenu.credits")} />
        <AccountMenuLink href="/account?tab=orders" icon={CreditCard} label={t("accountMenu.orders")} />
        <AccountMenuLink href="/account?tab=help" icon={CircleHelp} label={t("accountMenu.help")} />
        <AccountMenuLink href="/account?tab=messages" icon={Bell} label={t("accountMenu.messages")} />
        <AccountMenuLink href="/account?tab=feedback" icon={MessageSquare} label={t("accountMenu.feedback")} />
        <DropdownMenuSeparator className="h-px bg-slate-100" />
        <DropdownMenuItem
          disabled={isLoggingOut}
          onSelect={(event) => {
            event.preventDefault();
            onLogout();
          }}
          className="flex cursor-pointer items-center gap-2.5 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:text-slate-950 data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-950 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          {isLoggingOut ? t("loggingOut") : t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenuHeader({
  email,
  credits,
  creditsReady,
}: {
  email: string | null;
  credits: number | null;
  creditsReady: boolean;
}) {
  const t = useTranslations("Header");
  const masked = email ? maskAccountLabel(email) : t("personalAccount");
  return (
    <div className="bg-[#f8fafc] px-3 py-3 dark:bg-white/4">
      <div className="flex items-center gap-3">
        <Avatar size="lg" className="bg-[#c8d7ff] text-white dark:bg-[#3b4d7a]">
          <AvatarFallback className="bg-[#c8d7ff] text-sm font-black text-white dark:bg-[#3b4d7a]">
            {getAvatarFallback(email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950 dark:text-stone-100">{masked}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-stone-400">{t("personalAccount")}</p>
        </div>
        <Link
          href="/login"
          className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-stone-200 dark:hover:bg-white/10"
        >
          {t("switchAccount")}
        </Link>
      </div>
      <p className="mt-2 text-xs font-medium tabular-nums text-slate-500 dark:text-stone-400">
        {t("availableCredits", { credits: creditsReady ? credits ?? "--" : "--" })}
      </p>
    </div>
  );
}

function AccountMenuBanner() {
  const t = useTranslations("Header");
  return (
    <Link
      href="/pricing"
      className="mx-3 mb-1 mt-2 flex h-9 items-center justify-between rounded-md bg-gradient-to-r from-[#fff2ff] to-[#edf4ff] px-3 text-xs font-medium text-[#8b4bd8] transition hover:brightness-[0.98] dark:from-[#2a1d3a] dark:to-[#1d2a3f] dark:text-[#c7b3f0]"
    >
      <span>{t("upgradeTeamBanner")}</span>
      <span className="rounded bg-[#ff8ba7] px-1.5 py-0.5 text-[10px] font-bold text-white">{t("memberBadge")}</span>
    </Link>
  );
}

function AccountMenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href} className="flex h-10 items-center gap-2.5 border-t border-slate-100 px-4 text-sm font-medium text-slate-800 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:text-slate-950 data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-950 dark:border-white/5 dark:text-stone-200 dark:hover:bg-white/5 dark:hover:text-white dark:focus:bg-white/5 dark:focus:text-white dark:data-[highlighted]:bg-white/5 dark:data-[highlighted]:text-white">
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

function HeaderHelpDropdown() {
  const t = useTranslations("Header");
  const items = [
    { href: "/account?tab=help", label: t("imageGuide") },
    { href: "/account?tab=feedback", label: t("contactUs") },
  ];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="studio-button studio-button-compact hidden sm:inline-flex"
          title={t("helpCenter")}
          aria-label={t("openHelpMenuAria")}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="z-[80] min-w-[112px] overflow-hidden rounded-md border border-slate-100 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-[0_12px_28px_rgba(0,0,0,0.5)]"
      >
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              className="flex h-9 items-center rounded-sm px-3 text-sm font-medium text-slate-800 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:text-slate-950 data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-950"
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getAvatarFallback(email: string | null) {
  const name = email?.split("@")[0]?.trim();
  return (name?.slice(0, 1) || "V").toUpperCase();
}

function maskAccountLabel(value: string) {
  const [name, domain] = value.split("@");
  if (!domain) return value.length > 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
  return `${name.slice(0, 3)}****@${domain}`;
}

function MobileModuleMenu({ activeModule }: { activeModule: string }) {
  const t = useTranslations("Header");
  const tAny = useTranslations(); // 数据键全路径（Header.nav.* / Header.modules.*），用全局 t 解析
  const active = VISIBLE_TOP_MODULES.find((item) => item.key === activeModule) || VISIBLE_TOP_MODULES[0];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mac-button inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm"
          aria-label={t("switchModule")}
        >
          <ActiveIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{active.labelKey ? tAny(active.labelKey) : active.label}</span>
          <Menu className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="mac-surface z-[80] min-w-[190px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/50"
      >
        {VISIBLE_TOP_MODULES.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeModule;

          if (item.comingSoon) {
            return (
              <DropdownMenuItem
                key={item.key}
                disabled
                className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-400 outline-none"
              >
                <Icon className="h-4 w-4" />
                <span className="flex flex-1 items-center justify-between gap-3">
                  {item.labelKey ? tAny(item.labelKey) : item.label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    {t("comingSoon")}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem key={item.key} asChild>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold outline-none transition-colors ${
                  isActive ? "bg-white/80 text-[var(--mac-accent)]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="truncate">{item.labelKey ? tAny(item.labelKey) : item.label}</span>
                  {item.badge && (
                    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-1 text-[9px] font-black leading-none text-white">
                      {item.badge}
                    </span>
                  )}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function clearSupabaseLocalStorage() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access failures.
  }
}
