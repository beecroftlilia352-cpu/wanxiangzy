import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../supabase/migrations/20260819101500_admin_dashboard_period_aggregate.sql"),
  "utf8",
);

describe("admin dashboard period aggregate migration", () => {
  it("aggregates the bounded operating window in Postgres", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_admin_dashboard_period(p_since timestamptz)");
    expect(migration).toContain("FROM public.generations");
    expect(migration).toContain("FROM public.credit_logs");
    expect(migration).toContain("FROM public.profiles");
    expect(migration).toContain("created_at >= p_since");
    expect(migration).toContain("credits_refunded BIGINT");
  });

  it("does not expose the definer function to browser roles", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_admin_dashboard_period(timestamptz)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_period(timestamptz)");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("SET search_path = ''");
  });
});
