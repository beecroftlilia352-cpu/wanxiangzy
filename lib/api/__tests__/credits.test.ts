import { describe, it, expect } from "vitest";
import { CreditError, errorToResponsePayload } from "@/lib/api/credits";

describe("CreditError", () => {
  it("stores status and details", () => {
    const err = new CreditError("积分不足。需要 10，余额 5", 402, {
      required: 10,
      balance: 5,
    });
    expect(err.name).toBe("CreditError");
    expect(err.status).toBe(402);
    expect(err.required).toBe(10);
    expect(err.balance).toBe(5);
    expect(err.message).toContain("积分不足");
  });

  it("defaults to status 500", () => {
    const err = new CreditError("unknown error");
    expect(err.status).toBe(500);
    expect(err.required).toBeUndefined();
    expect(err.balance).toBeUndefined();
  });
});

describe("errorToResponsePayload", () => {
  it("returns CreditError fields", () => {
    const err = new CreditError("积分不足", 402, { required: 10, balance: 3 });
    const payload = errorToResponsePayload(err);
    expect(payload.status).toBe(402);
    expect(payload.body.error).toBe("积分不足");
    expect(payload.body.required).toBe(10);
    expect(payload.body.balance).toBe(3);
  });

  it("returns 500 for generic Error", () => {
    const err = new Error("something broke");
    const payload = errorToResponsePayload(err);
    expect(payload.status).toBe(500);
    expect(payload.body.error).toBe("something broke");
  });

  it("returns 500 for non-Error values", () => {
    const payload = errorToResponsePayload("string error");
    expect(payload.status).toBe(500);
    expect(payload.body.error).toBe("Internal server error");
  });
});
