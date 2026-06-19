/**
 * 统一的 Supabase Service Role Client（服务端专用）
 * 所有需要 admin 权限的模块统一从此处获取，避免重复创建和不一致。
 *
 * Requires Node.js >= 22. Earlier versions lack a native WebSocket
 * implementation; `RealtimeClient` would throw on instantiation
 * ("Node.js 20 detected without native WebSocket support") and the
 * worker would crash-loop. Node 22+ ships WebSocket as a global, so
 * supabase-js picks it up automatically without needing a transport
 * override.
 *
 * 详见 https://supabase.com/docs/guides/troubleshooting/javascript-uncaught-error
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[supabase/admin] NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 必须配置"
    );
  }

  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
