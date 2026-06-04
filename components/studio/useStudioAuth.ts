"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearCachedProfile,
  createClient,
  getCachedProfile,
  getCachedProfileCredits,
  setCachedProfileCredits,
} from "@/lib/supabase/client";

type StudioAuthProfile = {
  user?: { id?: string | null; email?: string | null } | null;
  credits?: number | null;
};

export function useStudioAuth() {
  const supabase = useMemo(() => createClient(), []);
  const requestSeqRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCreditsState] = useState<number | null>(null);

  const setAnonymousState = useCallback(() => {
    userIdRef.current = null;
    setIsAuthenticated(false);
    setAuthChecked(true);
    setUserId(null);
    setCreditsState(null);
  }, []);

  const applyAuthenticatedUser = useCallback(async (user: { id: string }, nextCredits?: number | null) => {
    userIdRef.current = user.id;
    setIsAuthenticated(true);
    setAuthChecked(true);
    setUserId(user.id);

    if (typeof nextCredits === "number") {
      setCreditsState(nextCredits);
      setCachedProfileCredits(user.id, nextCredits);
      return;
    }

    const creditsFromCache = await getCachedProfileCredits(user.id);
    if (userIdRef.current === user.id) setCreditsState(creditsFromCache);
  }, []);

  const applyAnonymous = useCallback(() => {
    requestSeqRef.current += 1;
    setAnonymousState();
  }, [setAnonymousState]);

  const refreshAuth = useCallback(async () => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;

    const applyIfCurrent = async (fn: () => void | Promise<void>) => {
      if (requestSeqRef.current !== seq) return false;
      await fn();
      return true;
    };

    try {
      const profile = await getCachedProfile();
      if (profile?.user?.id) {
        await applyIfCurrent(() => applyAuthenticatedUser({ id: profile.user!.id! }, profile.credits));
        return true;
      }
    } catch {
      // Fall back to the browser session below.
    }

    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await applyIfCurrent(() => applyAuthenticatedUser(data.user));
        return true;
      }
    } catch {
      // If both profile and user verification fail, treat it as anonymous only after this fallback.
    }

    await applyIfCurrent(setAnonymousState);
    return false;
  }, [applyAuthenticatedUser, setAnonymousState, supabase]);

  const setCredits = useCallback((nextCredits: number | null) => {
    setCreditsState(nextCredits);
    if (userId && typeof nextCredits === "number") setCachedProfileCredits(userId, nextCredits);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    void refreshAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        clearCachedProfile();
        applyAnonymous();
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        void refreshAuth();
      }
    });

    return () => {
      cancelled = true;
      requestSeqRef.current += 1;
      subscription.unsubscribe();
    };
  }, [applyAnonymous, applyAuthenticatedUser, refreshAuth, supabase]);

  return {
    authChecked,
    isAuthenticated,
    userId,
    credits,
    setCredits,
    refreshAuth,
  };
}
