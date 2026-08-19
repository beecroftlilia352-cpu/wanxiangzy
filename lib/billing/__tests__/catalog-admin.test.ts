import { describe, expect, it } from "vitest";
import { normalizeSubscriptionBonusPercent } from "@/lib/billing/catalog";

describe("admin billing catalog normalization", () => {
  it("uses the default when the operator leaves the field blank", () => {
    expect(normalizeSubscriptionBonusPercent(undefined)).toBe(5);
    expect(normalizeSubscriptionBonusPercent("")).toBe(5);
  });

  it("accepts decimal percentages in the supported range", () => {
    expect(normalizeSubscriptionBonusPercent("7.125")).toBe(7.13);
    expect(normalizeSubscriptionBonusPercent(0)).toBe(0);
    expect(normalizeSubscriptionBonusPercent(100)).toBe(100);
  });

  it("rejects invalid or unsafe percentages", () => {
    expect(normalizeSubscriptionBonusPercent("not-a-number")).toBeNull();
    expect(normalizeSubscriptionBonusPercent(-1)).toBeNull();
    expect(normalizeSubscriptionBonusPercent(100.01)).toBeNull();
  });
});
