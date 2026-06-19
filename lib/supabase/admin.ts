/**
 * 统一的 Supabase Service Role Client（服务端专用）
 * 所有需要 admin 权限的模块统一从此处获取，避免重复创建和不一致。
 *
 * 为什么传 `global.WebSocket = ws`：
 *   supabase-js 在 `createClient` 阶段会立即实例化 `RealtimeClient`，
 *   该类对运行环境做了一次 WebSocket 检测：Node < 22 没有原生 WebSocket，
 *   必须显式提供一个 `transport`。不传的话 worker 在 Node 20 上启动就抛
 *   "Node.js 20 detected without native WebSocket support" 然后 exit(1)，
 *   触发 PM2 死循环重启。
 *   详见 https://supabase.com/docs/guides/troubleshooting/javascript-uncaught-error
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

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
    // supabase-js 2.49.0 types don't yet expose `global.WebSocket` even
    // though the runtime honors it. Cast through `unknown` to keep the
    // field while we wait for the upstream type fix.
    global: { WebSocket: ws } as unknown as { fetch?: typeof fetch },
  });

  return adminClient;
}
