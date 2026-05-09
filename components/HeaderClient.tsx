"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Home, LogOut, Menu } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  clearCachedProfileCredits,
  createClient,
  getCachedProfileCredits,
  setCachedProfileCredits,
  subscribeToProfileCredits,
} from "@/lib/supabase/client";
import { TOP_MODULES, getActiveTopModule } from "@/lib/navigation";
import { TaskQueueButton } from "@/components/TaskQueueButton";

export function HeaderClient() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [locationSearch, setLocationSearch] = useState("");
  const activeModule = pathname === "/agent" && new URLSearchParams(locationSearch).get("intent") === "video" ? "aiVideo" : getActiveTopModule(pathname);
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
        if (loaded || cancelled) return;
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
    } = supabase.auth.onAuthStateChange(async (_e, session) => {
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
    <header className="studio-app-header sticky top-0 z-50 border-b border-slate-200/80 bg-white/94 backdrop-blur-xl">
      <div className="flex min-h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Image
                src="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/gemini-icon.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
                priority
                aria-hidden="true"
              />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-black text-slate-950 sm:text-[15px]">
                VastWear
              </span>
              <span className="block truncate text-[11px] font-medium text-slate-500">
                服装视觉生成平台
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 shadow-sm lg:flex">
            {TOP_MODULES.map((item) => {
              const active = activeModule === item.key;
              const Icon = item.icon;
              if (item.comingSoon) {
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled
                    title="AI 视频即将上线"
                    className={`relative inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl px-3 text-sm font-black transition ${
                      active
                        ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100"
                        : "text-slate-400"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                    <span className="ml-0.5 rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                      即将上线
                    </span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`relative inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-black transition ${
                    active
                      ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100"
                      : "text-slate-500 hover:bg-white/70 hover:text-slate-950"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="lg:hidden">
            <MobileModuleMenu activeModule={activeModule} />
          </div>

          {authReady && email && <TaskQueueButton />}

          {authReady && email && (
            <Link
              href="/history"
              className="hidden h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 sm:inline-flex"
            >
              我的作品
            </Link>
          )}

          {isLoginPage ? (
            <Link href="/" className="flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
              <Home className="mr-1.5 h-3.5 w-3.5" />
              首页
            </Link>
          ) : !authReady ? (
            <span className="flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-400 shadow-sm">
              登录
            </span>
          ) : email ? (
            <>
              <Link
                href="/create"
                className="flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700 shadow-sm transition hover:bg-amber-100"
              >
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                {creditsReady ? (
                  <span>{credits ?? "--"}</span>
                ) : (
                  <span className="h-3 w-5 animate-pulse rounded bg-amber-100" />
                )}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="hidden h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 shadow-sm transition hover:text-slate-950 disabled:opacity-50 sm:flex"
                title={`退出 ${email}`}
              >
                <LogOut className="h-3.5 w-3.5" />
                {isLoggingOut ? "退出中" : "退出"}
              </button>
            </>
          ) : (
            <Link href="/login" className="gradient-brand flex h-9 shrink-0 items-center rounded-xl px-4 text-xs font-bold text-white shadow-lg shadow-purple-200/70 transition-opacity hover:opacity-95">
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
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
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm"
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
          className="z-[80] min-w-[190px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/50"
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
                    isActive ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
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
