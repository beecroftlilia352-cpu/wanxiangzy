import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

const SUPPORT_FIELDS = [
  "id",
  "ticket_no",
  "status",
  "priority",
  "category",
  "title",
  "description",
  "resolution",
  "created_at",
  "updated_at",
].join(",");

const CATEGORY_LABELS: Record<string, string> = {
  billing: "充值支付",
  credit_issue: "积分异常",
  generation_failure: "生成问题",
  account: "账户问题",
  technical: "功能异常",
  other: "其他建议",
};

const ALLOWED_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const { data, error } = await getAdminClient()
      .from("admin_support_tickets")
      .select(SUPPORT_FIELDS)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      const status = error.message.includes("admin_support_tickets") ? 501 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(
      {
        tickets: ((data || []) as unknown as Record<string, unknown>[]).map((row) => ({
          id: stringValue(row.id),
          ticketNo: stringValue(row.ticket_no),
          status: stringValue(row.status),
          priority: stringValue(row.priority),
          category: stringValue(row.category),
          categoryLabel: CATEGORY_LABELS[stringValue(row.category)] || "其他建议",
          title: stringValue(row.title),
          description: stringValue(row.description),
          resolution: stringValue(row.resolution),
          createdAt: stringValue(row.created_at),
          updatedAt: stringValue(row.updated_at),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[support/feedback] GET error:", error);
    }
    return NextResponse.json({ error: "反馈记录加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`support-feedback:${auth.user.id}`, 8, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const category = normalizeCategory(body.category);
    const title = cleanText(body.title, 80) || CATEGORY_LABELS[category];
    const description = cleanText(body.description, 1200);
    const contact = cleanText(body.contact, 120);
    const pageUrl = cleanText(body.pageUrl, 300);

    if (description.length < 8) {
      return NextResponse.json({ error: "请至少填写 8 个字的反馈内容" }, { status: 400 });
    }

    const priority = category === "billing" || category === "credit_issue" ? "high" : "medium";
    const { data, error } = await getAdminClient()
      .from("admin_support_tickets")
      .insert({
        status: "open",
        priority,
        category,
        source: "user_feedback",
        user_id: auth.user.id,
        user_email: auth.user.email || null,
        title,
        description,
        tags: [category],
        metadata: {
          contact: contact || null,
          pageUrl: pageUrl || null,
          userAgent: request.headers.get("user-agent") || null,
        },
        created_by: auth.user.id,
        created_by_email: auth.user.email || null,
        created_by_role: "user",
      })
      .select("id,ticket_no,status,category,title,created_at")
      .single();

    if (error) {
      const status = error.message.includes("admin_support_tickets") ? 501 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({
      ok: true,
      ticket: {
        id: stringValue(data.id),
        ticketNo: stringValue(data.ticket_no),
        status: stringValue(data.status),
        category: stringValue(data.category),
        title: stringValue(data.title),
        createdAt: stringValue(data.created_at),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[support/feedback] POST error:", error);
    }
    return NextResponse.json({ error: "反馈提交失败" }, { status: 500 });
  }
}

function normalizeCategory(value: unknown) {
  const category = typeof value === "string" ? value : "";
  return ALLOWED_CATEGORIES.has(category) ? category : "other";
}

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
