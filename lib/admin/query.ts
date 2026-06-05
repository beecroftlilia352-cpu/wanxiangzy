export type AdminListQuery = {
  q: string;
  page: number;
  pageSize: number;
  status: string;
  module: string;
  sort: string;
  order: "asc" | "desc";
};

export function parseAdminListQuery(
  searchParams: URLSearchParams,
  options: {
    defaultPageSize?: number;
    maxPageSize?: number;
    allowedSorts?: string[];
    defaultSort?: string;
  } = {},
): AdminListQuery {
  const defaultPageSize = options.defaultPageSize || 50;
  const maxPageSize = options.maxPageSize || 200;
  const page = clampInteger(searchParams.get("page"), 1, 1, 10_000);
  const pageSize = clampInteger(searchParams.get("pageSize") || searchParams.get("limit"), defaultPageSize, 1, maxPageSize);
  const rawSort = normalizeString(searchParams.get("sort"), 60);
  const sort = options.allowedSorts?.length
    ? options.allowedSorts.includes(rawSort)
      ? rawSort
      : options.defaultSort || ""
    : rawSort;
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  return {
    q: normalizeString(searchParams.get("q"), 160),
    page,
    pageSize,
    status: normalizeString(searchParams.get("status"), 60),
    module: normalizeString(searchParams.get("module"), 80),
    sort,
    order,
  };
}

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeString(value: string | null, maxLength: number) {
  return (value || "").trim().slice(0, maxLength);
}
