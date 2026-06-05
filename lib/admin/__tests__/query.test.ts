import { describe, expect, it } from "vitest";
import { parseAdminListQuery } from "../query";

describe("admin query parser", () => {
  it("normalizes pagination, filters and sort whitelist", () => {
    const query = parseAdminListQuery(
      new URLSearchParams({
        q: "  user@example.com  ",
        page: "-10",
        pageSize: "999",
        status: " failed ",
        module: " tryon ",
        sort: "createdAt",
        order: "asc",
      }),
      { defaultPageSize: 50, maxPageSize: 100, allowedSorts: ["createdAt", "email"] },
    );

    expect(query).toEqual({
      q: "user@example.com",
      page: 1,
      pageSize: 100,
      status: "failed",
      module: "tryon",
      sort: "createdAt",
      order: "asc",
    });
  });

  it("falls back on invalid sort and malformed numbers", () => {
    const query = parseAdminListQuery(
      new URLSearchParams({
        page: "abc",
        limit: "20",
        sort: "drop table",
        order: "sideways",
      }),
      { allowedSorts: ["createdAt"], defaultSort: "createdAt" },
    );

    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.sort).toBe("createdAt");
    expect(query.order).toBe("desc");
  });
});
