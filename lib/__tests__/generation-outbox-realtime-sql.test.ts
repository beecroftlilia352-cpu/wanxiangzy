import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(
    projectRoot,
    "supabase/migrations/20260820113000_enable_generation_outbox_realtime.sql",
  ),
  "utf8",
);
const deploy = readFileSync(resolve(projectRoot, "scripts/deploy-aws-release.sh"), "utf8");
const localDeploy = readFileSync(resolve(projectRoot, "scripts/deploy-from-local.sh"), "utf8");
const deployWorkflow = readFileSync(
  resolve(projectRoot, ".github/workflows/deploy-aws-on-tag.yml"),
  "utf8",
);

describe("generation outbox Realtime SQL contract", () => {
  it("idempotently publishes the private outbox table", () => {
    expect(migration).toContain("FROM pg_catalog.pg_publication");
    expect(migration).toContain("FROM pg_catalog.pg_publication_tables");
    expect(migration).toContain("pubname = 'supabase_realtime'");
    expect(migration).toContain("schemaname = 'private'");
    expect(migration).toContain("tablename = 'generation_job_outbox'");
    expect(migration).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE private.generation_job_outbox",
    );
  });

  it("exposes a service-role-only readiness probe", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.is_generation_outbox_realtime_ready()",
    );
    expect(migration).toContain("GENERATION_OUTBOX_REALTIME_SERVICE_ROLE_REQUIRED");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.is_generation_outbox_realtime_ready()",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.is_generation_outbox_realtime_ready() TO service_role;",
    );
  });

  it("blocks AWS traffic switching when Realtime publication is not ready", () => {
    expect(deploy).toContain('"is_generation_outbox_realtime_ready"');
    expect(deploy).toContain("/rest/v1/rpc/is_generation_outbox_realtime_ready");
    expect(deploy).toContain(
      "generation outbox is missing from the Supabase Realtime publication",
    );
  });

  it("blocks local deployment when Realtime publication is not ready", () => {
    const gateIndex = localDeploy.indexOf("/rest/v1/rpc/is_generation_outbox_realtime_ready");
    const buildIndex = localDeploy.indexOf("npm run build");

    expect(gateIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(gateIndex);
    expect(localDeploy).toContain(
      "generation outbox is missing from the Supabase Realtime publication",
    );
  });

  it("keeps the legacy AWS workflow manual-only", () => {
    expect(deployWorkflow).toContain("workflow_dispatch:");
    expect(deployWorkflow).not.toMatch(/\n\s+push:\s*\n/);
  });
});
