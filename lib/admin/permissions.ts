export const ADMIN_ROLES = [
  "owner",
  "ops",
  "support",
  "finance",
  "reviewer",
  "engineer",
  "viewer",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "admin:read"
  | "users:read"
  | "users:write"
  | "credits:read"
  | "credits:write"
  | "billing:read"
  | "billing:write"
  | "billing:operate"
  | "tasks:read"
  | "tasks:operate"
  | "assets:read"
  | "assets:write"
  | "support_tickets:read"
  | "support_tickets:write"
  | "moderation:read"
  | "moderation:write"
  | "workers:read"
  | "workers:write"
  | "operation_requests:read"
  | "operation_requests:write"
  | "operation_requests:approve"
  | "exports:read"
  | "exports:write"
  | "saved_views:read"
  | "saved_views:write"
  | "reports:read"
  | "risk:read"
  | "diagnostics:read"
  | "evals:read"
  | "evals:write"
  | "prompts:read"
  | "prompts:write"
  | "providers:read"
  | "providers:write"
  | "audit:read"
  | "settings:read"
  | "settings:write";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  owner: [
    "admin:read",
    "users:read",
    "users:write",
    "credits:read",
    "credits:write",
    "billing:read",
    "billing:write",
    "billing:operate",
    "tasks:read",
    "tasks:operate",
    "assets:read",
    "assets:write",
    "support_tickets:read",
    "support_tickets:write",
    "moderation:read",
    "moderation:write",
    "workers:read",
    "workers:write",
    "operation_requests:read",
    "operation_requests:write",
    "operation_requests:approve",
    "exports:read",
    "exports:write",
    "saved_views:read",
    "saved_views:write",
    "reports:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "evals:write",
    "prompts:read",
    "prompts:write",
    "providers:read",
    "providers:write",
    "audit:read",
    "settings:read",
    "settings:write",
  ],
  ops: [
    "admin:read",
    "users:read",
    "credits:read",
    "billing:read",
    "tasks:read",
    "tasks:operate",
    "assets:read",
    "assets:write",
    "support_tickets:read",
    "support_tickets:write",
    "moderation:read",
    "moderation:write",
    "workers:read",
    "workers:write",
    "operation_requests:read",
    "operation_requests:write",
    "exports:read",
    "exports:write",
    "saved_views:read",
    "saved_views:write",
    "reports:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "evals:write",
    "prompts:read",
    "prompts:write",
    "providers:read",
    "audit:read",
    "settings:read",
  ],
  support: [
    "admin:read",
    "users:read",
    "credits:read",
    "billing:read",
    "tasks:read",
    "assets:read",
    "support_tickets:read",
    "support_tickets:write",
    "moderation:read",
    "operation_requests:read",
    "operation_requests:write",
    "saved_views:read",
    "saved_views:write",
    "reports:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "prompts:read",
    "audit:read",
  ],
  finance: [
    "admin:read",
    "users:read",
    "credits:read",
    "credits:write",
    "billing:read",
    "billing:write",
    "billing:operate",
    "operation_requests:read",
    "operation_requests:write",
    "operation_requests:approve",
    "support_tickets:read",
    "support_tickets:write",
    "exports:read",
    "exports:write",
    "saved_views:read",
    "saved_views:write",
    "reports:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "prompts:read",
    "audit:read",
  ],
  reviewer: [
    "admin:read",
    "users:read",
    "tasks:read",
    "assets:read",
    "assets:write",
    "support_tickets:read",
    "support_tickets:write",
    "moderation:read",
    "moderation:write",
    "operation_requests:read",
    "operation_requests:write",
    "saved_views:read",
    "saved_views:write",
    "reports:read",
    "billing:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "prompts:read",
    "audit:read",
  ],
  engineer: [
    "admin:read",
    "users:read",
    "credits:read",
    "billing:read",
    "billing:write",
    "billing:operate",
    "tasks:read",
    "tasks:operate",
    "assets:read",
    "assets:write",
    "support_tickets:read",
    "support_tickets:write",
    "moderation:read",
    "moderation:write",
    "workers:read",
    "workers:write",
    "operation_requests:read",
    "operation_requests:write",
    "exports:read",
    "exports:write",
    "saved_views:read",
    "saved_views:write",
    "reports:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "evals:write",
    "prompts:read",
    "prompts:write",
    "providers:read",
    "providers:write",
    "audit:read",
    "settings:read",
    "settings:write",
  ],
  viewer: [
    "admin:read",
    "users:read",
    "credits:read",
    "tasks:read",
    "assets:read",
    "support_tickets:read",
    "moderation:read",
    "workers:read",
    "operation_requests:read",
    "exports:read",
    "saved_views:read",
    "reports:read",
    "billing:read",
    "risk:read",
    "diagnostics:read",
    "evals:read",
    "prompts:read",
    "providers:read",
    "audit:read",
    "settings:read",
  ],
};

export function normalizeAdminRole(value: unknown): AdminRole {
  return typeof value === "string" && ADMIN_ROLES.includes(value as AdminRole)
    ? (value as AdminRole)
    : "viewer";
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getAdminPermissions(role: AdminRole): AdminPermission[] {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}

export function hasAdminPermission(
  role: AdminRole,
  permission: AdminPermission | AdminPermission[] = "admin:read",
) {
  const permissions = new Set(getAdminPermissions(role));
  const required = Array.isArray(permission) ? permission : [permission];
  return required.every((item) => permissions.has(item));
}

export function getBootstrapAdminEmails() {
  return parseEmailList(
    process.env.ADMIN_BOOTSTRAP_EMAILS ||
      process.env.ADMIN_EMAILS ||
      process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
      "",
  );
}

export function isBootstrapAdminEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && getBootstrapAdminEmails().includes(normalized);
}

function parseEmailList(value: string) {
  return value
    .split(/[,\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}
