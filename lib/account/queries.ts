export type AccountCursorPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
};

export type ParsedAccountListQuery = {
  q: string;
  from: string | null;
  to: string | null;
  limit: number;
  offset: number;
  sort: string;
};

export function parseAccountListQuery(
  searchParams: URLSearchParams,
  options: {
    defaultLimit?: number;
    maxLimit?: number;
    allowedSorts: readonly string[];
    defaultSort: string;
  },
): ParsedAccountListQuery {
  const defaultLimit = options.defaultLimit ?? 30;
  const maxLimit = options.maxLimit ?? 100;
  const rawSort = normalizeQueryText(searchParams.get("sort"), 40);
  const sort = options.allowedSorts.includes(rawSort) ? rawSort : options.defaultSort;

  return {
    q: normalizeQueryText(searchParams.get("q"), 120),
    from: normalizeDateParam(searchParams.get("from"), "from"),
    to: normalizeDateParam(searchParams.get("to"), "to"),
    limit: clampInteger(searchParams.get("limit"), defaultLimit, 1, maxLimit),
    offset: parseCursorOffset(searchParams.get("cursor")),
    sort,
  };
}

export function normalizeQueryText(value: string | null, maxLength: number) {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function normalizeDateParam(value: string | null, bound: "from" | "to") {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T${bound === "from" ? "00:00:00.000" : "23:59:59.999"}Z`)
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function buildOffsetPageInfo(rowCount: number, limit: number, offset: number): AccountCursorPageInfo {
  const hasMore = rowCount > limit;
  return {
    hasMore,
    nextCursor: hasMore ? String(offset + limit) : null,
    limit,
  };
}

export function escapeSupabaseLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`).replace(/[(),]/g, " ");
}

export function classifyCreditLogType(log: { amount: number; reason?: string | null; generation_id?: string | null }) {
  const reason = (log.reason || "").toLowerCase();
  if (reason.includes("充值") || reason.includes("checkout") || reason.includes("stripe") || reason.includes("billing")) {
    return "recharge";
  }
  if (reason.includes("退款") || reason.includes("退回") || reason.includes("refund") || reason.includes("failed")) {
    return "refund";
  }
  if (reason.includes("人工") || reason.includes("manual") || reason.includes("admin")) {
    return "manual";
  }
  if (reason.includes("补偿") || reason.includes("compensation")) {
    return "compensation";
  }
  if (log.generation_id || log.amount < 0) {
    return "generation";
  }
  return "other";
}

export function formatOrderNetAmount(order: { amountTotal: number; amountRefunded: number }) {
  return Math.max(0, Number(order.amountTotal || 0) - Number(order.amountRefunded || 0));
}

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseCursorOffset(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 10_000);
}
