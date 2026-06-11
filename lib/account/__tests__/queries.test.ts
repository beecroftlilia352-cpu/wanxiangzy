import { describe, expect, it } from "vitest";
import {
  buildOffsetPageInfo,
  classifyCreditLogType,
  formatOrderNetAmount,
  parseAccountListQuery,
} from "@/lib/account/queries";

describe("parseAccountListQuery", () => {
  it("normalizes limit, cursor, query and allowed sort", () => {
    const params = new URLSearchParams({
      q: "  checkout   session  ",
      limit: "999",
      cursor: "30",
      sort: "amount_desc",
    });

    const parsed = parseAccountListQuery(params, {
      allowedSorts: ["newest", "amount_desc"],
      defaultSort: "newest",
      defaultLimit: 30,
      maxLimit: 100,
    });

    expect(parsed.q).toBe("checkout session");
    expect(parsed.limit).toBe(100);
    expect(parsed.offset).toBe(30);
    expect(parsed.sort).toBe("amount_desc");
  });

  it("falls back for invalid cursor, date and sort", () => {
    const params = new URLSearchParams({
      cursor: "-10",
      from: "not-a-date",
      to: "2026-06-12",
      sort: "unknown",
    });

    const parsed = parseAccountListQuery(params, {
      allowedSorts: ["newest"],
      defaultSort: "newest",
    });

    expect(parsed.offset).toBe(0);
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBe("2026-06-12T23:59:59.999Z");
    expect(parsed.sort).toBe("newest");
  });
});

describe("buildOffsetPageInfo", () => {
  it("creates the next cursor only when an extra row was fetched", () => {
    expect(buildOffsetPageInfo(31, 30, 0)).toEqual({ hasMore: true, nextCursor: "30", limit: 30 });
    expect(buildOffsetPageInfo(30, 30, 0)).toEqual({ hasMore: false, nextCursor: null, limit: 30 });
  });
});

describe("classifyCreditLogType", () => {
  it("classifies common credit log reasons", () => {
    expect(classifyCreditLogType({ amount: 50, reason: "Stripe 充值到账" })).toBe("recharge");
    expect(classifyCreditLogType({ amount: -8, reason: "生成扣费", generation_id: "gen_123" })).toBe("generation");
    expect(classifyCreditLogType({ amount: 8, reason: "任务失败退回" })).toBe("refund");
    expect(classifyCreditLogType({ amount: 20, reason: "人工调整" })).toBe("manual");
    expect(classifyCreditLogType({ amount: 10, reason: "系统补偿" })).toBe("compensation");
  });
});

describe("formatOrderNetAmount", () => {
  it("subtracts refunded amount without going below zero", () => {
    expect(formatOrderNetAmount({ amountTotal: 14000, amountRefunded: 2000 })).toBe(12000);
    expect(formatOrderNetAmount({ amountTotal: 1000, amountRefunded: 2000 })).toBe(0);
  });
});
