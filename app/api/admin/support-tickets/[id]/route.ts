import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { requireAdminApi } from "@/lib/admin/auth";
import {
  normalizeSupportTicketPriority,
  normalizeSupportTicketStatus,
} from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("support_tickets:write");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = normalizeSupportTicketStatus(body.status);
  const priority = normalizeSupportTicketPriority(body.priority);
  const resolution = stringValue(body.resolution);
  const assignedToEmail = stringValue(body.assignedToEmail).toLowerCase();
  const reason = stringValue(body.reason);

  if (!isUuid(id)) {
    return NextResponse.json({ error: "ticket id is invalid" }, { status: 400 });
  }
  if (!status && !priority && !resolution && !assignedToEmail) {
    return NextResponse.json({ error: "no supported ticket update fields" }, { status: 400 });
  }
  if (reason.length < 4 || reason.length > 240) {
    return NextResponse.json({ error: "reason must be 4-240 characters" }, { status: 400 });
  }
  if ((status === "resolved" || status === "closed") && resolution.length < 6) {
    return NextResponse.json({ error: "resolution must be at least 6 characters" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (priority) patch.priority = priority;
  if (resolution) patch.resolution = resolution;
  if (assignedToEmail) patch.assigned_to_email = assignedToEmail;
  if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();

  const { data, error } = await getAdminClient()
    .from("admin_support_tickets")
    .update(patch)
    .eq("id", id)
    .select("id,ticket_no,status,priority,resolution,assigned_to_email,resolved_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "support_ticket.update",
    resourceType: "admin_support_ticket",
    resourceId: id,
    reason,
    metadata: { patch },
  });

  return NextResponse.json({ ok: true, ticket: data }, { headers: { "Cache-Control": "no-store" } });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
