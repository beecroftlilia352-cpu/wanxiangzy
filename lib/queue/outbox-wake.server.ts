import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Event-driven wake-up for the generation outbox relay.
 *
 * The relay normally polls the Postgres outbox with an idle backoff. When the
 * Realtime subscription is connected, an outbox INSERT wakes the relay
 * immediately so generation dispatch latency normally stays sub-second. The
 * subscription is strictly an accelerator: bounded polling remains the
 * delivery fallback, so a transient Realtime outage can never stall dispatch.
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
  let pendingWake = false;
  let connected = false;
  let closed = false;

  const unsubscribe = options.subscribe({
    onEvent: () => {
      const resolve = resolveCurrent;
      if (resolve) {
        resolveCurrent = null;
        resolve(true);
      } else {
        // Coalesce events that arrive after an empty claim but before wait()
        // installs its resolver. The next wait consumes the buffered edge.
        pendingWake = true;
      }
    },
    onStatus: (ok: boolean) => {
      connected = ok;
      if (!ok) {
        const resolve = resolveCurrent;
        resolveCurrent = null;
        resolve?.(false);
      }
    },
  });

  return {
    isConnected: () => connected,
    wait(timeoutMs, isStopping) {
      if (closed) return Promise.resolve(false);
      if (pendingWake) {
        pendingWake = false;
        return Promise.resolve(true);
      }
      // The channel can disconnect between the relay's isConnected() check
      // and this call. Return immediately so the relay switches to polling.
      if (!connected) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let interval: ReturnType<typeof setInterval> | undefined;
        const finish = (woken: boolean) => {
          if (settled) return;
          settled = true;
          if (resolveCurrent === finish) resolveCurrent = null;
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
      pendingWake = false;
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
