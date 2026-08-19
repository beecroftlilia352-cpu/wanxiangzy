import { describe, expect, it, vi } from "vitest";

import { createWakeNotifier } from "@/lib/queue/outbox-wake.server";

function notifier() {
  let onEvent: (() => void) | undefined;
  let onStatus: ((connected: boolean) => void) | undefined;
  const unsubscribe = vi.fn();
  const wake = createWakeNotifier({
    subscribe: (handlers) => {
      onEvent = handlers.onEvent;
      onStatus = handlers.onStatus;
      return unsubscribe;
    },
  });
  return { wake, fire: () => onEvent?.(), setStatus: (ok: boolean) => onStatus?.(ok), unsubscribe };
}

describe("outbox wake notifier", () => {
  it("resolves immediately when a wake event fires", async () => {
    const { wake, fire } = notifier();
    const pending = wake.wait(30_000);
    fire();
    await expect(pending).resolves.toBe(true);
    wake.close();
  });

  it("resolves false on timeout", async () => {
    const { wake } = notifier();
    await expect(wake.wait(10)).resolves.toBe(false);
    wake.close();
  });

  it("resolves false when stopping is requested", async () => {
    const { wake } = notifier();
    let stopping = false;
    const pending = wake.wait(30_000, () => stopping);
    stopping = true;
    await expect(pending).resolves.toBe(false);
    wake.close();
  });

  it("reflects subscription status and unsubscribes on close", () => {
    const { wake, setStatus, unsubscribe } = notifier();
    expect(wake.isConnected()).toBe(false);
    setStatus(true);
    expect(wake.isConnected()).toBe(true);
    setStatus(false);
    expect(wake.isConnected()).toBe(false);
    wake.close();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
