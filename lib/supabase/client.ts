"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
const creditsRequests = new Map<string, Promise<number>>();

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
    .catch(() => 0);

  creditsRequests.set(userId, request);
  return request;
}

export function setCachedProfileCredits(userId: string, credits: number) {
  creditsRequests.set(userId, Promise.resolve(credits));
}

export function clearCachedProfileCredits(userId?: string) {
  if (userId) {
    creditsRequests.delete(userId);
    return;
  }
  creditsRequests.clear();
}
