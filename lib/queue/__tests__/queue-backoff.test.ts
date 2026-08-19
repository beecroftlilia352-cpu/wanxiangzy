import { describe, expect, it } from "vitest";

import { emptyQueueDelayMs } from "@/lib/queue/queue-backoff";

describe("emptyQueueDelayMs", () => {
  it("starts at the base delay on the first empty claim", () => {
    expect(emptyQueueDelayMs(1, 500, 30_000)).toBe(500);
  });

  it("doubles on each further empty claim", () => {
    expect(emptyQueueDelayMs(2, 500, 30_000)).toBe(1_000);
    expect(emptyQueueDelayMs(3, 500, 30_000)).toBe(2_000);
    expect(emptyQueueDelayMs(4, 500, 30_000)).toBe(4_000);
  });

  it("caps the delay at the configured maximum", () => {
    expect(emptyQueueDelayMs(10, 500, 4_000)).toBe(4_000);
    expect(emptyQueueDelayMs(100, 500, 30_000)).toBe(30_000);
  });

  it("supports a custom growth factor", () => {
    expect(emptyQueueDelayMs(3, 1_000, 60_000, 3)).toBe(9_000);
  });

  it("clamps degenerate inputs", () => {
    expect(emptyQueueDelayMs(0, 500, 30_000)).toBe(500);
    expect(emptyQueueDelayMs(1, 0, 30_000)).toBe(1);
    expect(emptyQueueDelayMs(1, 5_000, 1_000)).toBe(5_000);
  });
});
