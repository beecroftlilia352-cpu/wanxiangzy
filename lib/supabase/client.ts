"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
const creditsRequests = new Map<string, Promise<number>>();
const creditsChangedEvent = "profile-credits-changed";

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return browserClient;
}

export function getCachedProfileCredits(userId: string): Promise<number> {
  const cached = creditsRequests.get(userId);
  if (cached) return cached;

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

  creditsRequests.set(userId, request);
  return request;
}

export function setCachedProfileCredits(userId: string, credits: number) {
  creditsRequests.set(userId, Promise.resolve(credits));
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
