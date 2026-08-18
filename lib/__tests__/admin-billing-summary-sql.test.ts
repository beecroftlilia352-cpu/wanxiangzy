import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../supabase/migrations/20260819112000_admin_billing_summary.sql"),
  "utf8",
);

describe("admin billing summary migration", () => {
  it("aggregates financial and fulfilment totals in Postgres", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_admin_billing_summary()");
    expect(migration).toContain("FROM public.payment_orders");
    expect(migration).toContain("FROM public.stripe_subscriptions");
    expect(migration).toContain("FROM public.stripe_webhook_events");
    expect(migration).toContain("amount_total - amount_refunded");
  });

  it("restricts the definer function to the service role", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_admin_billing_summary()");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("TO service_role");
  });
});
