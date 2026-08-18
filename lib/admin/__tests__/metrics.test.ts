import { describe, expect, it } from "vitest";
import { failureRateToPercent } from "@/lib/admin/metrics";

describe("admin dashboard metrics", () => {
  it("converts stored ratios to bounded display percentages", () => {
    expect(failureRateToPercent(0.1)).toBe(10);
    expect(failureRateToPercent(0)).toBe(0);
    expect(failureRateToPercent(1.2)).toBe(100);
    expect(failureRateToPercent(Number.NaN)).toBe(0);
  });
});
