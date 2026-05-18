import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { requireAdminApi } from "@/lib/admin/auth";
import {
  listAdminSupportTickets,
  normalizeSupportTicketCategory,
  normalizeSupportTicketPriority,
} from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdminApi("support_tickets:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const tickets = await listAdminSupportTickets({
    q: params.get("q") || "",
    status: params.get("status") || "",
    priority: params.get("priority") || "",
    category: params.get("category") || "",
    limit: Number(params.get("limit") || 80),
  });

  return NextResponse.json(tickets, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("support_tickets:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = stringValue(body.title);
  const description = stringValue(body.description);
  const category = normalizeSupportTicketCategory(body.category) || "other";
  const priority = normalizeSupportTicketPriority(body.priority) || "medium";
  const userId = stringValue(body.userId);
  const userEmail = stringValue(body.userEmail).toLowerCase();
  const generationId = stringValue(body.generationId);
  const assetSourceType = stringValue(body.assetSourceType);
  const assetSourceId = stringValue(body.assetSourceId);
  const tags = parseTags(body.tags);

  if (title.length < 4 || title.length > 120) {
    return NextResponse.json({ error: "title must be 4-120 characters" }, { status: 400 });
  }
  if (description.length < 8 || description.length > 2000) {
    return NextResponse.json({ error: "description must be 8-2000 characters" }, { status: 400 });
  }
  if (userId && !isUuid(userId)) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }
  if (generationId && !isUuid(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("admin_support_tickets")
    .insert({
      status: "open",
      priority,
      category,
      source: "admin",
      user_id: userId || null,
      user_email: userEmail || null,
      generation_id: generationId || null,
      asset_source_type: assetSourceType || null,
      asset_source_id: assetSourceId || null,
      title,
      description,
      tags,
      metadata: { createdFrom: "admin_console" },
      created_by: auth.context.userId,
      created_by_email: auth.context.email,
      created_by_role: auth.context.role,
    })
    .select("id,ticket_no,status,priority,category,title,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "support_ticket.create",
    resourceType: "admin_support_ticket",
    resourceId: String(data?.id || ""),
    reason: title,
    metadata: { category, priority, userId: userId || null, userEmail: userEmail || null, generationId: generationId || null, tags },
  });

  return NextResponse.json({ ok: true, ticket: data }, { headers: { "Cache-Control": "no-store" } });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTags(value: unknown) {
  const raw = Array.isArray(value) ? value.join(",") : stringValue(value);
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
