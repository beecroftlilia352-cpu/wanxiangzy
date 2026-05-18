"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Coins, Home, LogOut, Menu, Search } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  clearCachedProfileCredits,
  createClient,
  getCachedProfileCredits,
  setCachedProfileCredits,
  subscribeToProfileCredits,
} from "@/lib/supabase/client";
import { TOP_MODULES, getActiveTopModule } from "@/lib/navigation";
import { codexTheme } from "@/lib/design/codex-theme";

type HeaderAccountState = {
  authReady: boolean;
  creditsReady: boolean;
  credits: number | null;
  email: string | null;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
};

const marketingNav = [
  { label: "产品", href: "/create" },
  { label: "工作流", href: "/agent" },
  { label: "模特库", href: "/model" },
  { label: "案例", href: "/history" },
  { label: "资源", href: "/general-image" },
];

export function HeaderClient() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  if (pathname === "/") {
    return <MarketingHeader />;
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
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch("/api/profile", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (cancelled) return false;

        if (res.status === 401) {
          loadedCreditsForUserRef.current = null;
          setEmail(null);
          setCredits(null);
          setAuthReady(true);
          setCreditsReady(true);
          return true;
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.user) return false;

        loadedCreditsForUserRef.current = payload.user.id;
        setEmail(payload.user.email ?? null);
        setCredits(payload.credits ?? 0);
        setCachedProfileCredits(payload.user.id, payload.credits ?? 0);
        setAuthReady(true);
        setCreditsReady(true);
        return true;
      } catch {
        return false;
      } finally {
        window.clearTimeout(timeout);
      }
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
    clearCachedProfileCredits();
    setEmail(null);
    setCredits(null);
    setCreditsReady(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    await fetch("/api/logout", { method: "POST", cache: "no-store", signal: controller.signal }).catch(() => {});
    window.clearTimeout(timeout);
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    clearSupabaseLocalStorage();
    window.location.replace("/login");
  };

  return { authReady, creditsReady, credits, email, isLoggingOut, onLogout };
}

function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const account = useHeaderAccount();

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 96);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  return (
    <header
      className={`home-marketing-header sticky top-0 z-50 ${scrolled ? "home-marketing-header-scrolled" : ""}`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="home-marketing-logo shrink-0 text-[18px] font-semibold leading-none"
          aria-label="VastWearGen 首页"
        >
          VastWearGen
        </Link>

        <nav className="home-marketing-nav hidden flex-1 items-center gap-8 pl-4 text-[14px] font-semibold leading-none lg:flex" aria-label="主导航">
          {marketingNav.map((item) => (
            <Link key={item.label} href={item.href} className="transition">
              {item.label}
            </Link>
          ))}
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center" aria-label="搜索">
            <Search className="h-4 w-4" />
          </button>
        </nav>

        <div className="home-marketing-actions flex shrink-0 items-center gap-3 text-[14px] font-semibold leading-none">
          <MarketingAccountActions {...account} />
          <Link href="/create" className="home-trial-pill inline-flex h-10 items-center gap-1.5 rounded-full px-5 transition">
            进入工作台
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            className="home-menu-pill inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
            aria-label="打开导航"
          >
            <Menu className="h-4 w-4" />
          </button>
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
        登录
        <ChevronDown className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="home-login-pill hidden h-10 items-center gap-1.5 rounded-full px-4 transition sm:inline-flex">
          <Coins className="h-3.5 w-3.5" />
          {creditsReady ? <span>{credits ?? "--"}</span> : <span className="h-3 w-5 animate-pulse rounded bg-current opacity-20" />}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="mac-surface z-[80] min-w-[180px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/50"
        >
          <DropdownMenu.Item asChild>
            <Link href="/history" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition hover:bg-slate-50">
              我的作品
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/create" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition hover:bg-slate-50">
              进入工作台
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={isLoggingOut}
            onSelect={(event) => {
              event.preventDefault();
              onLogout();
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition hover:bg-slate-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "退出中" : "退出登录"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AppHeader({ pathname }: { pathname: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [locationSearch, setLocationSearch] = useState("");
  const activeModule =
    pathname === "/agent" && new URLSearchParams(locationSearch).get("intent") === "video"
      ? "aiVideo"
      : getActiveTopModule(pathname);
  const isLoginPage = pathname === "/login";
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [creditsReady, setCreditsReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const loadedCreditsForUserRef = useRef<string | null>(null);

  useEffect(() => {
    setLocationSearch(window.location.search);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileFromApi() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch("/api/profile", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (cancelled) return false;

        if (res.status === 401) {
          loadedCreditsForUserRef.current = null;
          setEmail(null);
          setCredits(null);
          setAuthReady(true);
          setCreditsReady(true);
          return true;
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.user) return false;

        loadedCreditsForUserRef.current = payload.user.id;
        setEmail(payload.user.email ?? null);
        setCredits(payload.credits ?? 0);
        setCachedProfileCredits(payload.user.id, payload.credits ?? 0);
        setAuthReady(true);
        setCreditsReady(true);
        return true;
      } catch {
        return false;
      } finally {
        window.clearTimeout(timeout);
      }
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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    clearCachedProfileCredits();
    setEmail(null);
    setCredits(null);
    setCreditsReady(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    await fetch("/api/logout", { method: "POST", cache: "no-store", signal: controller.signal }).catch(() => {});
    window.clearTimeout(timeout);
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    clearSupabaseLocalStorage();
    window.location.replace("/login");
  };

  return (
    <header className="studio-app-header mac-toolbar sticky top-0 z-50">
      <div className="flex min-h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <BrandMark />
          <DesktopTopNav activeModule={activeModule} />
        </div>

        <div className="studio-header-actions flex shrink-0 items-center gap-1.5">
          <div className="lg:hidden">
            <MobileModuleMenu activeModule={activeModule} />
          </div>
          <UserCreditActions
            authReady={authReady}
            creditsReady={creditsReady}
            credits={credits}
            email={email}
            isLoginPage={isLoginPage}
            isLoggingOut={isLoggingOut}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="VastWearGen 首页">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/88 shadow-sm">
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
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-sm font-black text-codex-ink sm:text-[15px]">
          {codexTheme.brand.name}
        </span>
        <span className="block truncate text-[11px] font-semibold text-codex-muted">
          {codexTheme.brand.subtitle}
        </span>
      </span>
    </Link>
  );
}

function DesktopTopNav({ activeModule }: { activeModule: string }) {
  return (
    <nav className="studio-surface-toolbar hidden items-center gap-1 p-1 lg:flex" aria-label="主导航">
      {TOP_MODULES.map((item) => {
        const active = activeModule === item.key;
        const Icon = item.icon;
        const className = `relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-black transition ${
          active
            ? "bg-white text-codex-ink shadow-sm ring-1 ring-[rgba(91,124,255,0.22)]"
            : "text-codex-muted hover:bg-white/72 hover:text-codex-ink"
        }`;

        if (item.comingSoon) {
          return (
            <button
              key={item.key}
              type="button"
              disabled
              title="视频功能即将上线"
              className={`${className} cursor-not-allowed opacity-55`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              <span className="ml-0.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-codex-faint">
                即将上线
              </span>
            </button>
          );
        }

        return (
          <Link key={item.key} href={item.href} className={className} aria-current={active ? "page" : undefined}>
            <Icon className="h-3.5 w-3.5" />
            {item.label}
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
  if (isLoginPage) {
    return (
      <Link href="/" className="studio-button studio-button-compact">
        <Home className="h-3.5 w-3.5" />
        首页
      </Link>
    );
  }

  if (!authReady) {
    return <span className="studio-status-badge">登录</span>;
  }

  if (!email) {
    return (
      <Link href="/login" className="codex-primary-action flex h-9 shrink-0 items-center rounded-full px-4 text-xs font-bold text-white">
        登录
      </Link>
    );
  }

  return (
    <>
      <Link href="/history" className="studio-button studio-button-compact hidden sm:inline-flex">
        我的作品
      </Link>
      <Link href="/create" className="studio-button studio-button-compact" title="剩余积分">
        <Coins className="h-3.5 w-3.5 text-[var(--codex-accent)]" />
        {creditsReady ? <span>{credits ?? "--"}</span> : <span className="h-3 w-5 animate-pulse rounded bg-slate-200" />}
      </Link>
      <button
        type="button"
        onClick={onLogout}
        disabled={isLoggingOut}
        className="studio-button studio-button-compact hidden sm:inline-flex"
        title={`退出 ${email}`}
      >
        <LogOut className="h-3.5 w-3.5" />
        {isLoggingOut ? "退出中" : "退出"}
      </button>
    </>
  );
}

function MobileModuleMenu({ activeModule }: { activeModule: string }) {
  const active = TOP_MODULES.find((item) => item.key === activeModule) || TOP_MODULES[0];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="mac-button inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm"
          aria-label="切换模块"
        >
          <ActiveIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{active.label}</span>
          <Menu className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="mac-surface z-[80] min-w-[190px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/50"
        >
          {TOP_MODULES.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeModule;

            if (item.comingSoon) {
              return (
                <DropdownMenu.Item
                  key={item.key}
                  disabled
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-400 outline-none"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex flex-1 items-center justify-between gap-3">
                    {item.label}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      即将上线
                    </span>
                  </span>
                </DropdownMenu.Item>
              );
            }

            return (
              <DropdownMenu.Item key={item.key} asChild>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold outline-none transition-colors ${
                    isActive ? "bg-white/80 text-[var(--mac-accent)]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
