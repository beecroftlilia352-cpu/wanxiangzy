import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819123000_fix_media_asset_idempotency_lock.sql",
  ),
  "utf8",
);

describe("media asset idempotency lock repair", () => {
  it("replaces the illegal NUL separator and fails closed on unknown definitions", () => {
    expect(migration).toContain("replace(v_definition, 'chr(0)', 'chr(31)')");
    expect(migration).toContain("CREATE_MEDIA_ASSET_UPLOAD_FUNCTION_MISSING");
    expect(migration).toContain("CREATE_MEDIA_ASSET_UPLOAD_LOCK_CONTRACT_UNRECOGNIZED");
    expect(migration).toContain("EXECUTE v_definition;");
  });
});
