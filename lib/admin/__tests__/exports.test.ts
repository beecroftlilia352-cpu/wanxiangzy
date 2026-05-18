import { describe, expect, it } from "vitest";
import { buildAdminExportCsv, normalizeAdminExportFilters, normalizeAdminExportType } from "../exports";

describe("admin exports", () => {
  it("normalizes supported export types and filters", () => {
    expect(normalizeAdminExportType("users")).toBe("users");
    expect(normalizeAdminExportType("unknown")).toBeNull();
    expect(normalizeAdminExportFilters({ q: " abc ", limit: 999, sourceType: "workflow" })).toEqual({
      q: "abc",
      status: "",
      module: "",
      sourceType: "workflow",
      stale: false,
      limit: 500,
      days: 14,
    });
  });

  it("builds csv with metadata and formula-safe cells", () => {
    const csv = buildAdminExportCsv({
      exportType: "users",
      exportedBy: "ops@example.com",
      exportedAt: "2026-05-18T15:00:00.000Z",
      expiresAt: "2026-05-18T16:00:00.000Z",
      data: {
        columns: ["email", "note"],
        rows: [
          ["user@example.com", "=HYPERLINK(\"https://example.com\")"],
          ["other@example.com", "@unsafe"],
        ],
      },
    });

    expect(csv).toContain("Exported by,ops@example.com");
    expect(csv).toContain("user@example.com,\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(csv).toContain("other@example.com,'@unsafe");
  });
});
