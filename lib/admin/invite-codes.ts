import { getAdminClient } from "@/lib/supabase/admin";

const QUERY_TIMEOUT_MS = 10_000;
const INVITE_CODE_COLUMNS = "id,code,campaign,note,status,max_uses,used_count,starts_at,expires_at,created_by,created_by_email,created_at,updated_at";
const INVITE_USAGE_COLUMNS = "id,invite_code_id,code,email,user_id,status,reason,metadata,created_at,released_at";

export type AdminInviteCode = {
  id: string;
  code: string;
  campaign: string | null;
  note: string | null;
  status: "active" | "disabled";
  maxUses: number;
  usedCount: number;
  remaining: number;
  startsAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminInviteCodeUsage = {
  id: string;
  inviteCodeId: string;
  code: string;
  email: string;
  userId: string | null;
  status: "used" | "released";
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  releasedAt: string | null;
};

export type AdminInviteCodeOverview = {
  codes: AdminInviteCode[];
  usages: AdminInviteCodeUsage[];
  metrics: {
    totalCodes: number;
    activeCodes: number;
    usedSlots: number;
    remainingSlots: number;
    usageRecords: number;
  };
  available: boolean;
  warnings: string[];
};

export async function getAdminInviteCodeOverview(args: {
  q?: string;
  status?: string;
  codeLimit?: number;
  usageLimit?: number;
} = {}): Promise<AdminInviteCodeOverview> {
  const warnings: string[] = [];
  const q = (args.q || "").trim().toLowerCase();
  const status = args.status === "active" || args.status === "disabled" ? args.status : "";
  const codeLimit = clampInteger(args.codeLimit, 20, 200, 100);
  const usageLimit = clampInteger(args.usageLimit, 20, 300, 120);
  const admin = getAdminClient();

  let codeQuery = admin
    .from("invite_codes")
    .select(INVITE_CODE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(codeLimit);
  if (status) codeQuery = codeQuery.eq("status", status);

  const codesResult = await runOptionalQuery<Record<string, unknown>[]>(
    codeQuery,
    "invite codes",
    warnings,
  );
  const usagesResult = await runOptionalQuery<Record<string, unknown>[]>(
    admin
      .from("invite_code_usages")
      .select(INVITE_USAGE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(usageLimit),
    "invite code usages",
    warnings,
  );

  if (!codesResult.ok || !usagesResult.ok) {
    return {
      codes: [],
      usages: [],
      metrics: {
        totalCodes: 0,
        activeCodes: 0,
        usedSlots: 0,
        remainingSlots: 0,
        usageRecords: 0,
      },
      available: false,
      warnings: uniqueStrings(warnings),
    };
  }

  const codes = (codesResult.data || []).map(mapInviteCode).filter((row) => matchesSearch(row, q));
  const usages = (usagesResult.data || []).map(mapInviteUsage).filter((row) => matchesUsageSearch(row, q));
  const metrics = codes.reduce(
    (acc, code) => {
      acc.totalCodes += 1;
      if (code.status === "active") acc.activeCodes += 1;
      acc.usedSlots += code.usedCount;
      acc.remainingSlots += code.remaining;
      return acc;
    },
    {
      totalCodes: 0,
      activeCodes: 0,
      usedSlots: 0,
      remainingSlots: 0,
      usageRecords: usages.filter((usage) => usage.status === "used").length,
    },
  );

  return {
    codes,
    usages,
    metrics,
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

function mapInviteCode(row: Record<string, unknown>): AdminInviteCode {
  const maxUses = Math.max(1, numberValue(row.max_uses));
  const usedCount = Math.max(0, numberValue(row.used_count));

  return {
    id: stringValue(row.id),
    code: stringValue(row.code),
    campaign: nullableString(row.campaign),
    note: nullableString(row.note),
    status: stringValue(row.status) === "disabled" ? "disabled" : "active",
    maxUses,
    usedCount,
    remaining: Math.max(0, maxUses - usedCount),
    startsAt: nullableString(row.starts_at),
    expiresAt: nullableString(row.expires_at),
    createdBy: nullableString(row.created_by),
    createdByEmail: nullableString(row.created_by_email),
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function mapInviteUsage(row: Record<string, unknown>): AdminInviteCodeUsage {
  return {
    id: stringValue(row.id),
    inviteCodeId: stringValue(row.invite_code_id),
    code: stringValue(row.code),
    email: stringValue(row.email),
    userId: nullableString(row.user_id),
    status: stringValue(row.status) === "released" ? "released" : "used",
    reason: nullableString(row.reason),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: nullableString(row.created_at),
    releasedAt: nullableString(row.released_at),
  };
}

async function runOptionalQuery<T>(
  query: PromiseLike<{ data?: T | null; error?: { code?: string; message?: string } | null }>,
  label: string,
  warnings: string[],
): Promise<{ ok: true; data: T | null } | { ok: false; data: null }> {
  try {
    const response = await withTimeout(query, QUERY_TIMEOUT_MS, `${label} timeout`);
    if (response.error) {
      if (!isMissingTableError(response.error)) warnings.push(`${label}: ${response.error.message || "query failed"}`);
      return { ok: false, data: null };
    }
    return { ok: true, data: response.data ?? null };
  } catch (error) {
    warnings.push(`${label}: ${toMessage(error)}`);
    return { ok: false, data: null };
  }
}

function matchesSearch(row: AdminInviteCode, q: string) {
  if (!q) return true;
  return [row.code, row.campaign || "", row.note || "", row.createdByEmail || ""].some((value) => value.toLowerCase().includes(q));
}

function matchesUsageSearch(row: AdminInviteCodeUsage, q: string) {
  if (!q) return true;
  return [row.code, row.email, row.userId || "", row.reason || ""].some((value) => value.toLowerCase().includes(q));
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const str = stringValue(value);
  return str || null;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const clean = value.trim();
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingTableError(error: { code?: string; message?: string }) {
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist");
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
