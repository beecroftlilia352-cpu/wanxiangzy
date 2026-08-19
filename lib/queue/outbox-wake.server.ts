import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Event-driven wake-up for the generation outbox relay.
 *
 * The relay normally polls the Postgres outbox with an idle backoff. When the
 * Realtime subscription is connected, an outbox INSERT wakes the relay
 * immediately so generation dispatch latency stays sub-second even while the
 * relay makes no idle polling calls. The subscription is strictly an
 * accelerator: the polling backoff remains the delivery fallback, so a
 * transient Realtime outage can never stall generation dispatch.
 */
export type WakeSubscriptionHandlers = {
  onEvent: () => void;
  onStatus: (connected: boolean) => void;
};

export type WakeNotifier = {
  /** Resolve when a wake event arrives, after `timeoutMs`, or when stopping. */
  wait(timeoutMs: number, isStopping?: () => boolean): Promise<boolean>;
  isConnected(): boolean;
  close(): void;
};

export function createWakeNotifier(options: {
  subscribe: (handlers: WakeSubscriptionHandlers) => () => void;
}): WakeNotifier {
  let resolveCurrent: ((woken: boolean) => void) | null = null;
  let connected = false;
  let closed = false;

  const unsubscribe = options.subscribe({
    onEvent: () => {
      const resolve = resolveCurrent;
      resolveCurrent = null;
      resolve?.(true);
    },
    onStatus: (ok: boolean) => {
      connected = ok;
    },
  });

  return {
    isConnected: () => connected,
    wait(timeoutMs, isStopping) {
      if (closed) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let interval: ReturnType<typeof setInterval> | undefined;
        const finish = (woken: boolean) => {
          if (settled) return;
          settled = true;
          resolveCurrent = null;
          if (timer) clearTimeout(timer);
          if (interval) clearInterval(interval);
          resolve(woken);
        };
        resolveCurrent = finish;
        timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
        if (isStopping) {
          interval = setInterval(() => {
            if (isStopping()) finish(false);
          }, 200);
        }
      });
    },
    close() {
      if (closed) return;
      closed = true;
      const resolve = resolveCurrent;
      resolveCurrent = null;
      resolve?.(false);
      unsubscribe();
    },
  };
}

/** Subscribe to INSERT events on the private generation outbox table. */
export function subscribeOutboxWake(
  client: SupabaseClient,
  handlers: WakeSubscriptionHandlers,
  options: { channelName?: string } = {},
): () => void {
  const channel: RealtimeChannel = client.channel(options.channelName ?? "outbox-wake", {
    config: { private: true },
  });
  channel
    .on("postgres_changes", { event: "INSERT", schema: "private", table: "generation_job_outbox" }, () => {
      handlers.onEvent();
    })
    .subscribe((status) => {
      handlers.onStatus(status === "SUBSCRIBED");
    });
  return () => {
    channel.unsubscribe();
  };
}
