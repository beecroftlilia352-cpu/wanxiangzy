import { describe, expect, it } from "vitest";
import { getAdminNavigationItem, getVisibleAdminNavigation } from "@/lib/admin/navigation";

function hrefs(role: Parameters<typeof getVisibleAdminNavigation>[0]) {
  return getVisibleAdminNavigation(role).flatMap((group) => group.children.map((item) => item.href));
}

describe("admin navigation policy", () => {
  it("exposes read-only platform surfaces to read roles without granting write access", () => {
    expect(hrefs("viewer")).toContain("/admin/providers");
    expect(hrefs("viewer")).toContain("/admin/workers");
    expect(hrefs("viewer")).toContain("/admin/prompts");
    expect(hrefs("support")).not.toContain("/admin/providers");
    expect(hrefs("support")).not.toContain("/admin/workers");
    expect(hrefs("ops")).toContain("/admin/providers");
    expect(hrefs("ops")).toContain("/admin/workers");
  });

  it("resolves nested pages to the most specific operational section", () => {
    expect(getAdminNavigationItem("/admin/generations/job-123").href).toBe("/admin/generations");
    expect(getAdminNavigationItem("/admin/users/user-123").href).toBe("/admin/users");
    expect(getAdminNavigationItem("/admin").href).toBe("/admin");
  });
});
