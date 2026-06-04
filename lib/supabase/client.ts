"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
const creditsRequests = new Map<string, { promise: Promise<number>; timestamp: number }>();
const creditsChangedEvent = "profile-credits-changed";
const CREDITS_CACHE_TTL_MS = 30_000; // 30 秒 TTL
const PROFILE_CACHE_TTL_MS = 60_000;
const PROFILE_FETCH_TIMEOUT_MS = 8_000;

type CachedProfilePayload = {
  user?: { id?: string | null; email?: string | null } | null;
  credits?: number | null;
};

let profileRequest:
  | { promise: Promise<CachedProfilePayload | null>; timestamp: number }
  | null = null;
let profileValue: { payload: CachedProfilePayload; timestamp: number } | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return browserClient;
}

export async function getCachedProfile(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && profileValue && now - profileValue.timestamp < PROFILE_CACHE_TTL_MS) {
    return profileValue.payload;
  }
  if (!options.force && profileRequest && now - profileRequest.timestamp < PROFILE_FETCH_TIMEOUT_MS) {
    return profileRequest.promise;
  }

  const request = fetchProfileFromApi();
  profileRequest = { promise: request, timestamp: now };
  return request;
}

export function clearCachedProfile() {
  profileRequest = null;
  profileValue = null;
}

async function fetchProfileFromApi(): Promise<CachedProfilePayload | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROFILE_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/profile", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const payload = await res.json().catch(() => ({})) as CachedProfilePayload;
    if (!payload.user?.id) return null;

    profileValue = { payload, timestamp: Date.now() };
    setCachedProfileCredits(payload.user.id, payload.credits ?? 0);
    return payload;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
    profileRequest = null;
  }
}

export function getCachedProfileCredits(userId: string): Promise<number> {
  const cached = creditsRequests.get(userId);
  const now = Date.now();

  // TTL 检查：缓存过期则清除并重新请求
  if (cached && now - cached.timestamp < CREDITS_CACHE_TTL_MS) {
    return cached.promise;
  }

  if (cached) {
    creditsRequests.delete(userId);
  }

  const request = Promise.resolve(
    createClient()
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single()
  )
    .then(({ data }) => data?.credits ?? 0)
    .catch(() => {
      creditsRequests.delete(userId);
      return 0;
    });

  creditsRequests.set(userId, { promise: request, timestamp: now });
  return request;
}

export function setCachedProfileCredits(userId: string, credits: number) {
  creditsRequests.set(userId, { promise: Promise.resolve(credits), timestamp: Date.now() });
  if (profileValue?.payload.user?.id === userId) {
    profileValue = {
      payload: { ...profileValue.payload, credits },
      timestamp: Date.now(),
    };
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(creditsChangedEvent, { detail: { userId, credits } })
    );
  }
}

export function clearCachedProfileCredits(userId?: string) {
  if (userId) {
    creditsRequests.delete(userId);
    return;
  }
  creditsRequests.clear();
}

export function subscribeToProfileCredits(
  handler: (payload: { userId: string; credits: number }) => void
) {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (
      detail &&
      typeof detail.userId === "string" &&
      typeof detail.credits === "number"
    ) {
      handler(detail);
    }
  };

  window.addEventListener(creditsChangedEvent, listener);
  return () => window.removeEventListener(creditsChangedEvent, listener);
}
