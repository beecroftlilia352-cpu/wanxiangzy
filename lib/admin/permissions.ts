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
  | "tasks:read"
  | "tasks:operate"
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
    "tasks:read",
    "tasks:operate",
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
    "tasks:read",
    "tasks:operate",
    "providers:read",
    "audit:read",
    "settings:read",
  ],
  support: [
    "admin:read",
    "users:read",
    "credits:read",
    "tasks:read",
    "audit:read",
  ],
  finance: [
    "admin:read",
    "users:read",
    "credits:read",
    "credits:write",
    "audit:read",
  ],
  reviewer: [
    "admin:read",
    "users:read",
    "tasks:read",
    "audit:read",
  ],
  engineer: [
    "admin:read",
    "users:read",
    "credits:read",
    "tasks:read",
    "tasks:operate",
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
