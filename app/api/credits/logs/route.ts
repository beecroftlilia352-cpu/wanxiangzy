import { NextRequest, NextResponse } from "next/server";
import {
  buildOffsetPageInfo,
  classifyCreditLogType,
  escapeSupabaseLike,
  parseAccountListQuery,
} from "@/lib/account/queries";
import { createServerSupabase } from "@/lib/supabase/server";

const CREDIT_LOG_FIELDS = [
  "id",
  "amount",
  "balance",
  "reason",
  "generation_id",
  "created_at",
].join(",");

const CREDIT_SORTS = ["newest", "oldest", "amount_desc", "amount_asc"] as const;
const CREDIT_DIRECTIONS = new Set(["income", "spend"]);
const CREDIT_TYPES = new Set(["recharge", "generation", "refund", "manual", "compensation", "other"]);

type CreditLogQueryBuilder = {
  gt: (column: string, value: number) => CreditLogQueryBuilder;
  not: (column: string, operator: string, value: null) => CreditLogQueryBuilder;
  or: (filters: string) => CreditLogQueryBuilder;
};

type CreditLogRow = {
  id: string;
  amount: number;
  balance: number;
  reason: string | null;
  generation_id: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const parsed = parseAccountListQuery(params, {
      allowedSorts: CREDIT_SORTS,
      defaultSort: "newest",
      defaultLimit: 30,
      maxLimit: 100,
    });
    const direction = params.get("direction") || "";
    const type = params.get("type") || "";

    let query = supabase
      .from("credit_logs")
      .select(CREDIT_LOG_FIELDS, { count: "exact" })
      .eq("user_id", user.id);

    if (parsed.from) query = query.gte("created_at", parsed.from);
    if (parsed.to) query = query.lte("created_at", parsed.to);

    if (CREDIT_DIRECTIONS.has(direction)) {
      query = direction === "income" ? query.gt("amount", 0) : query.lt("amount", 0);
    }

    if (CREDIT_TYPES.has(type)) {
      query = applyCreditTypeFilter(query, type);
    }

    if (parsed.q) {
      const q = escapeSupabaseLike(parsed.q);
      query = query.or(`reason.ilike.%${q}%,generation_id.ilike.%${q}%,id.ilike.%${q}%`);
    }

    if (parsed.sort === "oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (parsed.sort === "amount_desc") {
      query = query.order("amount", { ascending: false }).order("created_at", { ascending: false });
    } else if (parsed.sort === "amount_asc") {
      query = query.order("amount", { ascending: true }).order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error, count } = await query.range(parsed.offset, parsed.offset + parsed.limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? (data as unknown as CreditLogRow[]) : [];
    const logs = rows.slice(0, parsed.limit).map((row) => ({
      ...row,
      type: classifyCreditLogType(row),
    }));

    return NextResponse.json(
      {
        logs,
        pageInfo: buildOffsetPageInfo(rows.length, parsed.limit, parsed.offset),
        summary: buildCreditSummary(logs, count ?? logs.length),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[credits/logs] error:", error);
    }
    return NextResponse.json({ error: "灵点记录加载失败" }, { status: 500 });
  }
}

function applyCreditTypeFilter<T extends CreditLogQueryBuilder>(query: T, type: string): T {
  if (type === "recharge") {
    return query.gt("amount", 0).or("reason.ilike.%充值%,reason.ilike.%checkout%,reason.ilike.%stripe%,reason.ilike.%billing%") as T;
  }
  if (type === "generation") {
    return query.not("generation_id", "is", null) as T;
  }
  if (type === "refund") {
    return query.gt("amount", 0).or("reason.ilike.%退款%,reason.ilike.%退回%,reason.ilike.%refund%,reason.ilike.%failed%") as T;
  }
  if (type === "manual") {
    return query.or("reason.ilike.%人工%,reason.ilike.%manual%,reason.ilike.%admin%") as T;
  }
  if (type === "compensation") {
    return query.or("reason.ilike.%补偿%,reason.ilike.%compensation%") as T;
  }
  return query;
}

function buildCreditSummary(logs: Array<{ amount: number }>, count: number) {
  return logs.reduce(
    (summary, log) => {
      if (log.amount > 0) summary.pageIncome += log.amount;
      if (log.amount < 0) summary.pageSpend += Math.abs(log.amount);
      return summary;
    },
    { pageIncome: 0, pageSpend: 0, count },
  );
}
