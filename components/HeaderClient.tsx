"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { clearCachedProfileCredits, createClient, getCachedProfileCredits, setCachedProfileCredits, subscribeToProfileCredits } from "@/lib/supabase/client";
import { Coins } from "lucide-react";

export function HeaderClient() {
  const supabase = createClient();
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

    loadProfileFromApi().then((loaded) => {
      if (loaded || cancelled) return;
      return supabase.auth.getUser();
    }).then((result) => {
      if (!result || cancelled) return;
      const { data } = result;
      if (data.user) {
        loadUserCredits(data.user);
      } else {
        setAuthReady(true);
        setCreditsReady(true);
      }
    }).catch(() => {
      setAuthReady(true);
      setCreditsReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
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
    <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md">
      <div className="h-14 px-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-bold text-base leading-none">
          <Image
            src="/gemini-icon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 flex-shrink-0 rounded-md object-contain"
            priority
            aria-hidden="true"
          />
          <span className="gradient-brand-text">万象衣造 AI｜VastWearGen</span>
        </a>

        <nav className="flex items-center gap-5 text-sm leading-none">
          <a href="/create" className="hover:text-purple-600 transition-colors font-medium">开始创作</a>
          <a href="/history" className="hover:text-purple-600 transition-colors font-medium">历史记录</a>

          {!authReady ? (
            <div className="h-7 w-[92px] rounded-full bg-gray-100 animate-pulse" />
          ) : email ? (
            <div className="flex items-center gap-2">
              <a href="/create" className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors min-w-[52px] justify-center">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                {creditsReady ? (
                  <span className="text-xs font-bold text-amber-700">{credits ?? "--"}</span>
                ) : (
                  <span className="h-3 w-5 rounded bg-amber-100 animate-pulse" />
                )}
              </a>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                title={`退出 ${email}`}
              >
                {isLoggingOut ? "退出中..." : "退出"}
              </button>
            </div>
          ) : (
            <a href="/login" className="px-4 py-1.5 rounded-full gradient-brand text-white text-sm font-semibold hover:opacity-90">
              登录
            </a>
          )}
        </nav>
      </div>
    </header>
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
