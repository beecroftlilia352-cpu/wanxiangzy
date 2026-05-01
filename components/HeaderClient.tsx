"use client";

import { useEffect, useRef, useState } from "react";
import { clearCachedProfileCredits, createClient, getCachedProfileCredits } from "@/lib/supabase/client";
import { Coins } from "lucide-react";

export function HeaderClient() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const loadedCreditsForUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUserCredits(user: { id: string; email?: string | null }) {
      setEmail(user.email ?? null);
      setAuthReady(true);
      if (loadedCreditsForUserRef.current === user.id) return;

      loadedCreditsForUserRef.current = user.id;
      const profileCredits = await getCachedProfileCredits(user.id);

      if (!cancelled) setCredits(profileCredits);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        loadUserCredits(data.user);
      } else {
        setAuthReady(true);
      }
    }).catch(() => {
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) {
        await loadUserCredits(session.user);
      } else {
        loadedCreditsForUserRef.current = null;
        setEmail(null);
        setCredits(null);
        setAuthReady(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    clearCachedProfileCredits();
    setEmail(null);
    setCredits(null);
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
          <span className="gradient-brand-text">万象衣造 AI｜VastWearGen</span>
        </a>

        <nav className="flex items-center gap-5 text-sm leading-none">
          <a href="/create" className="hover:text-purple-600 transition-colors font-medium">开始创作</a>
          <a href="/history" className="hover:text-purple-600 transition-colors font-medium">历史记录</a>

          {!authReady ? (
            <div className="h-7 w-[92px] rounded-full bg-gray-100 animate-pulse" />
          ) : email ? (
            <div className="flex items-center gap-2">
              {credits !== null && (
                <a href="/create" className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-bold text-amber-700">{credits}</span>
                </a>
              )}
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
