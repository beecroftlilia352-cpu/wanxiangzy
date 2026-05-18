import { CREDIT_COSTS, DEFAULT_LINGYA_MODEL, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { getAdminClient } from "@/lib/supabase/admin";
import type { TaskStatusGroup } from "@/lib/task-queue";
import { normalizeModule } from "@/lib/task-queue-index";

export type AdminMetric = {
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "good" | "warning" | "danger";
};

export type AdminOverview = {
  metrics: AdminMetric[];
  taskHealth: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  generationHealth: {
    total: number;
    today: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    failureRate: number;
  };
  creditHealth: {
    sampledBalance: number;
    sampledConsumed: number;
    recentSpend: number;
    recentRefund: number;
  };
  moduleStats: AdminBreakdownItem[];
  modelStats: AdminBreakdownItem[];
  recentTasks: AdminTaskListItem[];
  warnings: string[];
};

export type AdminBreakdownItem = {
  key: string;
  label: string;
  count: number;
  failed: number;
  running: number;
  credits: number;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  credits: number;
  totalCreditsUsed: number;
  createdAt: string | null;
  updatedAt: string | null;
  generationCount: number;
  workflowCount: number;
  latestGenerationAt: string | null;
};

export type AdminUserList = {
  rows: AdminUserListItem[];
  total: number;
  warnings: string[];
};

export type AdminTaskListItem = {
  id: string;
  sourceId: string;
  sourceType: "generation" | "workflow";
  userId: string;
  module: string;
  moduleLabel: string;
  title: string;
  status: string;
  statusGroup: TaskStatusGroup;
  progress: number;
  expectedCount: number;
  resultCount: number;
  inputThumbnails: string[];
  resultThumbnails: string[];
  errorMessage: string | null;
  applyUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  model?: string | null;
  imageSize?: string | null;
  credits?: number | null;
};

export type AdminTaskList = {
  rows: AdminTaskListItem[];
  total: number;
  source: "task_queue_items" | "fallback";
  warnings: string[];
};

export type AdminAuditLog = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

export type AdminAuditList = {
  rows: AdminAuditLog[];
  available: boolean;
  warnings: string[];
};

export type AdminProviderCatalog = {
  defaultModel: LingyaModel;
  models: Array<{
    model: LingyaModel;
    provider: string;
    endpointKind: string;
    configured: boolean;
    envKeys: string[];
    costs: Record<ImageSize, number>;
    notes: string;
  }>;
  modules: Array<{
    key: string;
    label: string;
    route: string;
    readModel: string;
    risk: "low" | "medium" | "high";
    adminV1: string;
  }>;
};

export type AdminCreditLogItem = {
  id: string;
  userId: string;
  email: string | null;
  amount: number;
  balance: number;
  reason: string;
  generationId: string | null;
  createdAt: string | null;
};

export type AdminCreditList = {
  rows: AdminCreditLogItem[];
  total: number;
  metrics: {
    debits: number;
    credits: number;
    net: number;
    affectedUsers: number;
  };
  warnings: string[];
};

export type AdminAssetListItem = {
  id: string;
  userId: string;
  sourceType: "generation" | "reference" | "favorite-plan";
  module: string;
  moduleLabel: string;
  title: string;
  status: string;
  urls: string[];
  inputUrls: string[];
  createdAt: string | null;
  updatedAt: string | null;
  detailUrl: string;
};

export type AdminAssetList = {
  rows: AdminAssetListItem[];
  total: number;
  warnings: string[];
};

export type AdminMemberListItem = {
  userId: string;
  email: string | null;
  role: string;
  status: string;
  enabled: boolean;
  displayName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminMemberList = {
  rows: AdminMemberListItem[];
  available: boolean;
  warnings: string[];
};

export type AdminConfigVersion = {
  id: string;
  configKey: string;
  status: string;
  value: Record<string, unknown>;
  createdBy: string | null;
  publishedAt: string | null;
  createdAt: string | null;
};

export type AdminSettingsOverview = {
  configVersions: AdminConfigVersion[];
  available: boolean;
  runtime: Array<{
    key: string;
    label: string;
    configured: boolean;
    scope: "auth" | "storage" | "provider" | "queue" | "admin";
  }>;
  warnings: string[];
};

export type AdminUserDetail = {
  profile: AdminUserListItem | null;
  creditLogs: AdminCreditLogItem[];
  tasks: AdminTaskListItem[];
  assets: AdminAssetListItem[];
  warnings: string[];
};

export type AdminTaskDetail = {
  id: string;
  sourceType: "generation" | "workflow";
  task: AdminTaskListItem | null;
  payload: Record<string, unknown>;
  queueItem: AdminTaskListItem | null;
  creditLogs: AdminCreditLogItem[];
  workflowSteps: Array<Record<string, unknown>>;
  workflowEvents: Array<Record<string, unknown>>;
  auditLogs: AdminAuditLog[];
  warnings: string[];
};

type CountQuery = PromiseLike<unknown>;
type SupabaseQuery = PromiseLike<unknown>;

const QUERY_TIMEOUT_MS = 7_000;
const SHORT_QUERY_TIMEOUT_MS = 3_500;
const PROFILE_COLUMNS = "id,email,display_name,credits,total_credits_used,created_at,updated_at";
const PROFILE_COLUMNS_FALLBACK = "id,email,display_name,credits,created_at,updated_at";
const TASK_QUEUE_COLUMNS = [
  "id",
  "user_id",
  "source_type",
  "source_id",
  "module",
  "title",
  "status",
  "status_group",
  "progress",
  "expected_count",
  "result_count",
  "input_thumbnails",
  "result_thumbnails",
  "error_message",
  "apply_url",
  "created_at",
  "updated_at",
  "completed_at",
].join(",");
const GENERATION_COLUMNS = [
  "id",
  "user_id",
  "status",
  "error_message",
  "result_urls",
  "created_at",
  "updated_at",
  "completed_at",
  "processing_started_at",
  "job_payload",
  "clothing_urls",
  "model_face_url",
  "reference_url",
  "credits_used",
  "credits_cost",
  "ai_model",
  "image_size",
].join(",");
const WORKFLOW_COLUMNS = [
  "id",
  "user_id",
  "status",
  "intent",
  "summary",
  "input_images",
  "final_outputs",
  "error_message",
  "created_at",
  "updated_at",
  "completed_at",
  "cost_reserved",
  "cost_settled",
].join(",");
const CREDIT_LOG_COLUMNS = "id,user_id,amount,balance,reason,generation_id,created_at";
const ADMIN_MEMBER_COLUMNS = "user_id,email,role,status,enabled,display_name,created_at,updated_at";
const ADMIN_CONFIG_COLUMNS = "id,config_key,value,status,created_by,published_at,created_at";

export async function getAdminOverview(): Promise<AdminOverview> {
  const admin = getAdminClient();
  const warnings: string[] = [];
  const now = Date.now();
  const todayIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalUsers,
    newUsers,
    generationTotal,
    generationToday,
    generationQueued,
    generationRunning,
    generationCompleted,
    generationFailed,
    taskQueued,
    taskRunning,
    taskCompleted,
    taskFailed,
    workflowRunning,
    workflowFailed,
    creditHealth,
    recentGenerationRows,
    recentTasks,
  ] = await Promise.all([
    countRows(admin.from("profiles").select("id", { count: "planned", head: true }), "profiles total", warnings),
    countRows(admin.from("profiles").select("id", { count: "planned", head: true }).gte("created_at", todayIso), "profiles today", warnings),
    countRows(admin.from("generations").select("id", { count: "planned", head: true }), "generations total", warnings),
    countRows(admin.from("generations").select("id", { count: "planned", head: true }).gte("created_at", todayIso), "generations today", warnings),
    countRows(admin.from("generations").select("id", { count: "planned", head: true }).eq("status", "queued"), "generations queued", warnings),
    countRows(admin.from("generations").select("id", { count: "planned", head: true }).in("status", ["processing_tryon", "processing_face_swap", "running", "generating"]), "generations running", warnings),
    countRows(admin.from("generations").select("id", { count: "planned", head: true }).eq("status", "completed"), "generations completed", warnings),
    countRows(admin.from("generations").select("id", { count: "planned", head: true }).eq("status", "failed"), "generations failed", warnings),
    countRows(admin.from("task_queue_items").select("id", { count: "planned", head: true }).eq("status_group", "queued"), "task queue queued", warnings, true),
    countRows(admin.from("task_queue_items").select("id", { count: "planned", head: true }).eq("status_group", "running"), "task queue running", warnings, true),
    countRows(admin.from("task_queue_items").select("id", { count: "planned", head: true }).eq("status_group", "completed"), "task queue completed", warnings, true),
    countRows(admin.from("task_queue_items").select("id", { count: "planned", head: true }).eq("status_group", "failed"), "task queue failed", warnings, true),
    countRows(admin.from("agent_workflows").select("id", { count: "planned", head: true }).in("status", ["queued", "running"]), "workflow running", warnings, true),
    countRows(admin.from("agent_workflows").select("id", { count: "planned", head: true }).in("status", ["failed", "cancelled", "canceled"]), "workflow failed", warnings, true),
    loadCreditHealth(sevenDaysIso, warnings),
    loadRecentGenerationRows(warnings),
    listAdminTasks({ limit: 8 }),
  ]);

  const aggregate = aggregateGenerations(recentGenerationRows);
  const taskHealth = {
    queued: taskQueued || generationQueued,
    running: taskRunning || generationRunning + workflowRunning,
    completed: taskCompleted || generationCompleted,
    failed: taskFailed || generationFailed + workflowFailed,
  };
  const failureRate = generationTotal > 0 ? generationFailed / generationTotal : 0;

  return {
    metrics: [
      { label: "用户总数", value: totalUsers, hint: `24h 新增 ${newUsers}`, tone: "neutral" },
      { label: "24h 生成", value: generationToday, hint: `累计 ${generationTotal}`, tone: "good" },
      { label: "运行中任务", value: taskHealth.queued + taskHealth.running, hint: `${taskHealth.failed} 个失败需排查`, tone: taskHealth.failed > 0 ? "warning" : "neutral" },
      { label: "失败率", value: Math.round(failureRate * 1000) / 10, hint: "按 generations 总量估算", tone: failureRate > 0.08 ? "danger" : failureRate > 0.03 ? "warning" : "good" },
      { label: "样本积分余额", value: creditHealth.sampledBalance, hint: `近 7 天消耗 ${creditHealth.recentSpend}`, tone: "neutral" },
    ],
    taskHealth,
    generationHealth: {
      total: generationTotal,
      today: generationToday,
      queued: generationQueued,
      running: generationRunning,
      completed: generationCompleted,
      failed: generationFailed,
      failureRate,
    },
    creditHealth,
    moduleStats: aggregate.moduleStats,
    modelStats: aggregate.modelStats,
    recentTasks: recentTasks.rows,
    warnings: uniqueStrings([...warnings, ...recentTasks.warnings]),
  };
}

export async function listAdminUsers(args: { q?: string; limit?: number } = {}): Promise<AdminUserList> {
  const admin = getAdminClient();
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 100, 30);
  const q = (args.q || "").trim();

  let query = admin
    .from("profiles")
    .select(PROFILE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.ilike("email", `%${q}%`);
  }

  let result = await runQuery<Record<string, unknown>[]>(query, "profiles list", warnings);
  if (!result.data && result.error && result.error.toLowerCase().includes("total_credits_used")) {
    let fallbackQuery = admin
      .from("profiles")
      .select(PROFILE_COLUMNS_FALLBACK, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) fallbackQuery = fallbackQuery.ilike("email", `%${q}%`);
    result = await runQuery<Record<string, unknown>[]>(fallbackQuery, "profiles list fallback", warnings);
  }

  const profiles = Array.isArray(result.data) ? result.data : [];
  const userIds = profiles.map((row) => stringValue(row.id)).filter(Boolean);
  const generationStats = await loadUserGenerationStats(userIds, warnings);
  const workflowStats = await loadUserWorkflowStats(userIds, warnings);

  return {
    rows: profiles.map((row) => {
      const profile = mapProfileRow(row);
      const generation = generationStats.get(profile.id) || { count: 0, latestAt: null };
      return {
        ...profile,
        generationCount: generation.count,
        workflowCount: workflowStats.get(profile.id) || 0,
        latestGenerationAt: generation.latestAt,
      };
    }),
    total: result.count ?? profiles.length,
    warnings: uniqueStrings(warnings),
  };
}

function mapProfileRow(row: Record<string, unknown>): AdminUserListItem {
  return {
    id: stringValue(row.id),
    email: stringValue(row.email),
    displayName: nullableString(row.display_name),
    credits: numberValue(row.credits),
    totalCreditsUsed: numberValue(row.total_credits_used),
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
    generationCount: 0,
    workflowCount: 0,
    latestGenerationAt: null,
  };
}

export async function listAdminTasks(args: {
  q?: string;
  module?: string;
  status?: string;
  sourceType?: "generation" | "workflow" | "all";
  limit?: number;
} = {}): Promise<AdminTaskList> {
  const admin = getAdminClient();
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 100, 40);
  const status = normalizeStatusFilter(args.status);
  const module = normalizeModuleFilter(args.module);
  const sourceType = args.sourceType && args.sourceType !== "all" ? args.sourceType : "";
  const q = (args.q || "").trim().toLowerCase();

  let query = admin
    .from("task_queue_items")
    .select(TASK_QUEUE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit * (q ? 3 : 1));
  if (status) query = query.eq("status_group", status);
  if (module) query = query.eq("module", module);
  if (sourceType) query = query.eq("source_type", sourceType);

  const indexed = await runQuery<Record<string, unknown>[]>(query, "task queue list", warnings, true);
  if (indexed.data) {
    let rows = indexed.data.map(mapTaskQueueRow);
    if (q) rows = rows.filter((row) => matchesTaskSearch(row, q));
    return {
      rows: rows.slice(0, limit),
      total: indexed.count ?? rows.length,
      source: "task_queue_items",
      warnings: uniqueStrings(warnings),
    };
  }

  const fallback = await loadFallbackTasks({ limit, status, module, sourceType, q }, warnings);
  return {
    rows: fallback.rows,
    total: fallback.total,
    source: "fallback",
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminAuditLogs(args: { limit?: number } = {}): Promise<AdminAuditList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 100, 50);
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_audit_logs")
      .select("id,actor_user_id,actor_email,actor_role,action,resource_type,resource_id,reason,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    "admin audit logs",
    warnings,
    true,
  );

  if (!result.data) {
    return { rows: [], available: false, warnings: uniqueStrings(warnings) };
  }

  return {
    rows: result.data.map((row) => ({
      id: stringValue(row.id),
      actorUserId: nullableString(row.actor_user_id),
      actorEmail: nullableString(row.actor_email),
      actorRole: nullableString(row.actor_role),
      action: stringValue(row.action),
      resourceType: stringValue(row.resource_type),
      resourceId: nullableString(row.resource_id),
      reason: nullableString(row.reason),
      metadata: isRecord(row.metadata) ? row.metadata : {},
      createdAt: nullableString(row.created_at),
    })),
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminCreditLogs(args: { q?: string; limit?: number } = {}): Promise<AdminCreditList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 200, 80);
  const q = (args.q || "").trim().toLowerCase();
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("credit_logs")
      .select(CREDIT_LOG_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(q ? Math.min(limit * 4, 300) : limit),
    "credit logs",
    warnings,
    true,
  );

  const rows = result.data || [];
  const profileEmails = await loadProfileEmails(rows.map((row) => stringValue(row.user_id)), warnings);
  let mapped = rows.map((row) => {
    const userId = stringValue(row.user_id);
    return {
      id: stringValue(row.id),
      userId,
      email: profileEmails.get(userId) || null,
      amount: numberValue(row.amount),
      balance: numberValue(row.balance),
      reason: stringValue(row.reason),
      generationId: nullableString(row.generation_id),
      createdAt: nullableString(row.created_at),
    };
  });

  if (q) {
    mapped = mapped.filter((row) => [
      row.id,
      row.userId,
      row.email || "",
      row.reason,
      row.generationId || "",
    ].some((value) => value.toLowerCase().includes(q)));
  }

  const visible = mapped.slice(0, limit);
  const debits = visible.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const credits = visible.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  return {
    rows: visible,
    total: result.count ?? mapped.length,
    metrics: {
      debits,
      credits,
      net: credits - debits,
      affectedUsers: new Set(visible.map((row) => row.userId).filter(Boolean)).size,
    },
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminAssets(args: { q?: string; module?: string; limit?: number } = {}): Promise<AdminAssetList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 12, 120, 60);
  const q = (args.q || "").trim().toLowerCase();
  const module = normalizeModuleFilter(args.module);

  let generationQuery = getAdminClient()
    .from("generations")
    .select(GENERATION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(q || module ? Math.min(limit * 4, 300) : limit);
  if (module) generationQuery = generationQuery.eq("job_payload->>kind", module);

  const generationResult = await runQuery<Record<string, unknown>[]>(
    generationQuery,
    "asset generations",
    warnings,
    true,
  );

  let rows = (generationResult.data || [])
    .map(mapGenerationAssetRow)
    .filter((row) => row.urls.length > 0 || row.inputUrls.length > 0);

  if (!module) {
    rows.push(...await loadReferenceAssets(Math.min(30, limit), warnings));
    rows.push(...await loadFavoritePlanAssets(Math.min(30, limit), warnings));
  }

  if (q) rows = rows.filter((row) => matchesAssetSearch(row, q));
  rows = rows.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  return {
    rows: rows.slice(0, limit),
    total: generationResult.count ?? rows.length,
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminMembers(args: { limit?: number } = {}): Promise<AdminMemberList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 100, 50);
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_members")
      .select(ADMIN_MEMBER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit),
    "admin members",
    warnings,
    true,
  );

  if (!result.data) {
    return { rows: [], available: false, warnings: uniqueStrings(warnings) };
  }

  return {
    rows: result.data.map((row) => ({
      userId: stringValue(row.user_id),
      email: nullableString(row.email),
      role: stringValue(row.role) || "viewer",
      status: stringValue(row.status) || (row.enabled === false ? "disabled" : "active"),
      enabled: row.enabled !== false,
      displayName: nullableString(row.display_name),
      createdAt: nullableString(row.created_at),
      updatedAt: nullableString(row.updated_at),
    })),
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

export async function getAdminSettingsOverview(): Promise<AdminSettingsOverview> {
  const warnings: string[] = [];
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_config_versions")
      .select(ADMIN_CONFIG_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50),
    "admin config versions",
    warnings,
    true,
  );

  return {
    configVersions: (result.data || []).map((row) => ({
      id: stringValue(row.id),
      configKey: stringValue(row.config_key),
      status: stringValue(row.status) || "draft",
      value: isRecord(row.value) ? row.value : {},
      createdBy: nullableString(row.created_by),
      publishedAt: nullableString(row.published_at),
      createdAt: nullableString(row.created_at),
    })),
    available: Boolean(result.data),
    runtime: getRuntimeSettingHealth(),
    warnings: uniqueStrings(warnings),
  };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const warnings: string[] = [];
  const profileResult = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .limit(1),
    "user detail profile",
    warnings,
  );
  let profileRows = profileResult.data || [];
  if (!profileRows.length && profileResult.error?.toLowerCase().includes("total_credits_used")) {
    const fallback = await runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("profiles")
        .select(PROFILE_COLUMNS_FALLBACK)
        .eq("id", userId)
        .limit(1),
      "user detail profile fallback",
      warnings,
      true,
    );
    profileRows = fallback.data || [];
  }

  const profile = profileRows[0] ? mapProfileRow(profileRows[0]) : null;
  const [creditLogs, tasks, assets] = await Promise.all([
    listAdminCreditLogs({ q: userId, limit: 30 }),
    loadUserTasks(userId, warnings),
    loadUserAssets(userId, warnings),
  ]);

  return {
    profile,
    creditLogs: creditLogs.rows,
    tasks,
    assets,
    warnings: uniqueStrings([...warnings, ...creditLogs.warnings]),
  };
}

export async function getAdminTaskDetail(id: string): Promise<AdminTaskDetail> {
  const warnings: string[] = [];
  const [queueItem, generation, workflow] = await Promise.all([
    loadQueueItemBySourceId(id, warnings),
    loadGenerationDetail(id, warnings),
    loadWorkflowDetail(id, warnings),
  ]);

  if (generation.row) {
    const task = mapGenerationRow(generation.row);
    const [creditLogs, auditLogs] = await Promise.all([
      loadCreditLogsByGeneration(id, warnings),
      loadAuditLogsByResource(id, warnings),
    ]);
    return {
      id,
      sourceType: "generation",
      task,
      payload: isRecord(generation.row.job_payload) ? generation.row.job_payload : {},
      queueItem,
      creditLogs,
      workflowSteps: [],
      workflowEvents: [],
      auditLogs,
      warnings: uniqueStrings([...warnings, ...generation.warnings]),
    };
  }

  if (workflow.row) {
    const task = mapWorkflowRow(workflow.row);
    const [steps, events, auditLogs] = await Promise.all([
      loadWorkflowSteps(id, warnings),
      loadWorkflowEvents(id, warnings),
      loadAuditLogsByResource(id, warnings),
    ]);
    return {
      id,
      sourceType: "workflow",
      task,
      payload: workflow.row,
      queueItem,
      creditLogs: [],
      workflowSteps: steps,
      workflowEvents: events,
      auditLogs,
      warnings: uniqueStrings([...warnings, ...workflow.warnings]),
    };
  }

  return {
    id,
    sourceType: queueItem?.sourceType || "generation",
    task: queueItem,
    payload: {},
    queueItem,
    creditLogs: [],
    workflowSteps: [],
    workflowEvents: [],
    auditLogs: await loadAuditLogsByResource(id, warnings),
    warnings: uniqueStrings(warnings),
  };
}

export function getAdminProviderCatalog(): AdminProviderCatalog {
  return {
    defaultModel: DEFAULT_LINGYA_MODEL,
    models: [
      {
        model: "nano-banana-2",
        provider: "LaoZhang",
        endpointKind: "Gemini native image",
        configured: Boolean(process.env.LAOZHANG_API_KEY?.trim()),
        envKeys: ["LAOZHANG_API_KEY", "LAOZHANG_BASE_URL", "LAOZHANG_NANO_BANANA_MODEL"],
        costs: CREDIT_COSTS["nano-banana-2"],
        notes: "默认低成本主力模型，适合批量生产和姿势裂变。",
      },
      {
        model: "nano-banana-pro",
        provider: "LaoZhang",
        endpointKind: "Gemini native image",
        configured: Boolean(process.env.LAOZHANG_API_KEY?.trim()),
        envKeys: ["LAOZHANG_API_KEY", "LAOZHANG_BASE_URL", "LAOZHANG_NANO_BANANA_PRO_MODEL"],
        costs: CREDIT_COSTS["nano-banana-pro"],
        notes: "高质量模型，适合品牌大片和复杂参考图。",
      },
      {
        model: "gpt-image-2",
        provider: "Plato",
        endpointKind: "OpenAI-compatible image",
        configured: Boolean(process.env.PLATO_API_KEY || process.env.LINGYA_API_KEY),
        envKeys: ["PLATO_API_KEY", "PLATO_BASE_URL", "PLATO_GPT_IMAGE_MODEL"],
        costs: CREDIT_COSTS["gpt-image-2"],
        notes: "适合稳定编辑类任务，Plato 未配置时回退 LINGYA_API_KEY。",
      },
    ],
    modules: [
      { key: "tryon", label: "服装上身", route: "/create", readModel: "generations + task_queue_items", risk: "medium", adminV1: "只读诊断" },
      { key: "pose", label: "姿势裂变", route: "/pose", readModel: "generations + prompt trace", risk: "medium", adminV1: "只读诊断" },
      { key: "model", label: "专属模特", route: "/model", readModel: "generations", risk: "medium", adminV1: "只读诊断" },
      { key: "modelBackground", label: "模特换背景", route: "/model-background", readModel: "generations", risk: "medium", adminV1: "只读诊断" },
      { key: "grass", label: "种草图", route: "/grass", readModel: "generations", risk: "low", adminV1: "只读诊断" },
      { key: "productSet", label: "商品套图", route: "/product-set", readModel: "generations + favorites", risk: "medium", adminV1: "只读诊断" },
      { key: "garment3d", label: "服装 3D", route: "/garment-3d", readModel: "generations", risk: "low", adminV1: "只读诊断" },
      { key: "faceSwap", label: "换脸", route: "/face-swap", readModel: "generations", risk: "high", adminV1: "只读诊断" },
      { key: "workflow", label: "Agent 工作流", route: "/agent", readModel: "agent_workflows + steps/events", risk: "high", adminV1: "只读诊断" },
    ],
  };
}

async function loadProfileEmails(userIds: string[], warnings: string[]) {
  const uniqueIds = uniqueStrings(userIds).slice(0, 300);
  const emails = new Map<string, string>();
  if (!uniqueIds.length) return emails;

  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("profiles")
      .select("id,email")
      .in("id", uniqueIds),
    "profile email lookup",
    warnings,
    true,
  );

  for (const row of result.data || []) {
    const id = stringValue(row.id);
    const email = stringValue(row.email);
    if (id && email) emails.set(id, email);
  }
  return emails;
}

async function loadUserTasks(userId: string, warnings: string[]) {
  const [generations, workflows] = await Promise.all([
    runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("generations")
        .select(GENERATION_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      "user detail generations",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("agent_workflows")
        .select(WORKFLOW_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      "user detail workflows",
      warnings,
      true,
    ),
  ]);

  return [
    ...(generations.data || []).map(mapGenerationRow),
    ...(workflows.data || []).map(mapWorkflowRow),
  ]
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, 40);
}

async function loadUserAssets(userId: string, warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("generations")
      .select(GENERATION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    "user detail assets",
    warnings,
    true,
  );

  return (result.data || [])
    .map(mapGenerationAssetRow)
    .filter((row) => row.urls.length > 0 || row.inputUrls.length > 0)
    .slice(0, 24);
}

async function loadQueueItemBySourceId(id: string, warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("task_queue_items")
      .select(TASK_QUEUE_COLUMNS)
      .eq("source_id", id)
      .limit(1),
    "task detail queue item",
    warnings,
    true,
  );
  return result.data?.[0] ? mapTaskQueueRow(result.data[0]) : null;
}

async function loadGenerationDetail(id: string, warnings: string[]) {
  const localWarnings: string[] = [];
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("generations")
      .select(GENERATION_COLUMNS)
      .eq("id", id)
      .limit(1),
    "task detail generation",
    localWarnings,
    true,
  );
  warnings.push(...localWarnings);
  return { row: result.data?.[0] || null, warnings: localWarnings };
}

async function loadWorkflowDetail(id: string, warnings: string[]) {
  const localWarnings: string[] = [];
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("agent_workflows")
      .select(WORKFLOW_COLUMNS)
      .eq("id", id)
      .limit(1),
    "task detail workflow",
    localWarnings,
    true,
  );
  warnings.push(...localWarnings);
  return { row: result.data?.[0] || null, warnings: localWarnings };
}

async function loadCreditLogsByGeneration(generationId: string, warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("credit_logs")
      .select(CREDIT_LOG_COLUMNS)
      .eq("generation_id", generationId)
      .order("created_at", { ascending: false })
      .limit(20),
    "task detail credit logs",
    warnings,
    true,
  );
  const rows = result.data || [];
  const emails = await loadProfileEmails(rows.map((row) => stringValue(row.user_id)), warnings);
  return rows.map((row) => {
    const userId = stringValue(row.user_id);
    return {
      id: stringValue(row.id),
      userId,
      email: emails.get(userId) || null,
      amount: numberValue(row.amount),
      balance: numberValue(row.balance),
      reason: stringValue(row.reason),
      generationId: nullableString(row.generation_id),
      createdAt: nullableString(row.created_at),
    };
  });
}

async function loadAuditLogsByResource(resourceId: string, warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_audit_logs")
      .select("id,actor_user_id,actor_email,actor_role,action,resource_type,resource_id,reason,metadata,created_at")
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false })
      .limit(20),
    "task detail audit logs",
    warnings,
    true,
  );
  return (result.data || []).map((row) => ({
    id: stringValue(row.id),
    actorUserId: nullableString(row.actor_user_id),
    actorEmail: nullableString(row.actor_email),
    actorRole: nullableString(row.actor_role),
    action: stringValue(row.action),
    resourceType: stringValue(row.resource_type),
    resourceId: nullableString(row.resource_id),
    reason: nullableString(row.reason),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: nullableString(row.created_at),
  }));
}

async function loadWorkflowSteps(workflowId: string, warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("agent_workflow_steps")
      .select("id,workflow_id,step_key,type,title,status,depends_on,input,params,output,quality,error_message,retry_count,started_at,completed_at,created_at")
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: true })
      .limit(80),
    "workflow detail steps",
    warnings,
    true,
  );
  return result.data || [];
}

async function loadWorkflowEvents(workflowId: string, warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("agent_workflow_events")
      .select("id,workflow_id,event_type,step_id,message,metadata,created_at")
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: false })
      .limit(80),
    "workflow detail events",
    warnings,
    true,
  );
  return result.data || [];
}

async function loadReferenceAssets(limit: number, warnings: string[]): Promise<AdminAssetListItem[]> {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("reference_images")
      .select("id,user_id,url,label,category,is_preset,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    "reference assets",
    warnings,
    true,
  );

  return (result.data || []).map((row) => {
    const id = stringValue(row.id);
    const category = stringValue(row.category) || "reference";
    return {
      id,
      userId: stringValue(row.user_id),
      sourceType: "reference" as const,
      module: category,
      moduleLabel: `参考图:${category}`,
      title: stringValue(row.label) || "参考图",
      status: row.is_preset === true ? "preset" : "user",
      urls: [stringValue(row.url)].filter(Boolean),
      inputUrls: [],
      createdAt: nullableString(row.created_at),
      updatedAt: nullableString(row.created_at),
      detailUrl: "/admin/assets",
    };
  });
}

async function loadFavoritePlanAssets(limit: number, warnings: string[]): Promise<AdminAssetListItem[]> {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("product_set_favorite_plans")
      .select("id,user_id,name,mode,image_type,plan_preview,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit),
    "favorite plan assets",
    warnings,
    true,
  );

  return (result.data || []).map((row) => {
    const id = stringValue(row.id);
    return {
      id,
      userId: stringValue(row.user_id),
      sourceType: "favorite-plan" as const,
      module: "productSet",
      moduleLabel: "商品套图方案",
      title: stringValue(row.name) || "收藏方案",
      status: stringValue(row.mode) || "smart",
      urls: extractUrls(row.plan_preview).slice(0, 4),
      inputUrls: [],
      createdAt: nullableString(row.created_at),
      updatedAt: nullableString(row.updated_at),
      detailUrl: "/admin/assets",
    };
  });
}

function mapGenerationAssetRow(row: Record<string, unknown>): AdminAssetListItem {
  const payload = isRecord(row.job_payload) ? row.job_payload : {};
  const module = normalizeModuleFilter(stringValue(payload.kind) || stringValue(payload.module) || inferModuleFromPayload(payload)) || "tryon";
  const id = stringValue(row.id);
  return {
    id,
    userId: stringValue(row.user_id),
    sourceType: "generation",
    module,
    moduleLabel: moduleLabel(module),
    title: `${moduleLabel(module)} ${id.slice(0, 8)}`,
    status: stringValue(row.status) || "unknown",
    urls: arrayOfStrings(row.result_urls),
    inputUrls: inferInputThumbnails(row, payload),
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at) || nullableString(row.completed_at),
    detailUrl: `/admin/generations?q=${encodeURIComponent(id)}`,
  };
}

function matchesAssetSearch(row: AdminAssetListItem, q: string) {
  return [
    row.id,
    row.userId,
    row.sourceType,
    row.module,
    row.moduleLabel,
    row.title,
    row.status,
  ].some((value) => value.toLowerCase().includes(q));
}

function getRuntimeSettingHealth(): AdminSettingsOverview["runtime"] {
  return [
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), scope: "auth" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase anon key", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), scope: "auth" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role", configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), scope: "admin" },
    { key: "ADMIN_BOOTSTRAP_EMAILS", label: "Bootstrap admin emails", configured: Boolean(process.env.ADMIN_BOOTSTRAP_EMAILS || process.env.ADMIN_EMAILS), scope: "admin" },
    { key: "TASK_QUEUE_CACHE_MODE", label: "Task queue cache mode", configured: Boolean(process.env.TASK_QUEUE_CACHE_MODE), scope: "queue" },
    { key: "UPSTASH_REDIS_REST_URL", label: "Upstash Redis", configured: Boolean(process.env.UPSTASH_REDIS_REST_URL), scope: "queue" },
    { key: "IMAGE_STORAGE_PROVIDER", label: "Image storage provider", configured: Boolean(process.env.IMAGE_STORAGE_PROVIDER), scope: "storage" },
    { key: "ALIYUN_OSS_BUCKET", label: "Aliyun OSS bucket", configured: Boolean(process.env.ALIYUN_OSS_BUCKET), scope: "storage" },
    { key: "LAOZHANG_API_KEY", label: "LaoZhang API", configured: Boolean(process.env.LAOZHANG_API_KEY), scope: "provider" },
    { key: "PLATO_API_KEY", label: "Plato API", configured: Boolean(process.env.PLATO_API_KEY), scope: "provider" },
    { key: "LINGYA_API_KEY", label: "Lingya API", configured: Boolean(process.env.LINGYA_API_KEY), scope: "provider" },
  ];
}

function aggregateGenerations(rows: Record<string, unknown>[]) {
  const moduleMap = new Map<string, AdminBreakdownItem>();
  const modelMap = new Map<string, AdminBreakdownItem>();

  for (const row of rows) {
    const payload = isRecord(row.job_payload) ? row.job_payload : {};
    const module = normalizeModuleFilter(stringValue(payload.kind) || stringValue(payload.module) || inferModuleFromPayload(payload));
    const model = stringValue(row.ai_model) || stringValue(payload.aiModel) || "unknown";
    const statusGroup = normalizeTaskStatusGroup(stringValue(row.status), arrayOfStrings(row.result_urls).length);
    const credits = numberValue(row.credits_used) || numberValue(row.credits_cost);

    bumpBreakdown(moduleMap, module || "unknown", moduleLabel(module || "unknown"), statusGroup, credits);
    bumpBreakdown(modelMap, model, model, statusGroup, credits);
  }

  return {
    moduleStats: Array.from(moduleMap.values()).sort((a, b) => b.count - a.count).slice(0, 8),
    modelStats: Array.from(modelMap.values()).sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

function bumpBreakdown(
  map: Map<string, AdminBreakdownItem>,
  key: string,
  label: string,
  statusGroup: TaskStatusGroup,
  credits: number,
) {
  const item = map.get(key) || { key, label, count: 0, failed: 0, running: 0, credits: 0 };
  item.count += 1;
  item.credits += credits;
  if (statusGroup === "failed") item.failed += 1;
  if (statusGroup === "queued" || statusGroup === "running") item.running += 1;
  map.set(key, item);
}

async function loadCreditHealth(sinceIso: string, warnings: string[]) {
  const [profiles, logs] = await Promise.all([
    runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("profiles")
        .select("credits,total_credits_used")
        .order("updated_at", { ascending: false })
        .limit(1000),
      "credit profile sample",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("credit_logs")
        .select("amount,balance,reason,created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000),
      "credit logs sample",
      warnings,
      true,
    ),
  ]);

  const profileRows = profiles.data || [];
  const logRows = logs.data || [];
  return {
    sampledBalance: profileRows.reduce((sum, row) => sum + numberValue(row.credits), 0),
    sampledConsumed: profileRows.reduce((sum, row) => sum + numberValue(row.total_credits_used), 0),
    recentSpend: Math.abs(logRows.filter((row) => numberValue(row.amount) < 0).reduce((sum, row) => sum + numberValue(row.amount), 0)),
    recentRefund: logRows.filter((row) => numberValue(row.amount) > 0).reduce((sum, row) => sum + numberValue(row.amount), 0),
  };
}

async function loadRecentGenerationRows(warnings: string[]) {
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("generations")
      .select("status,result_urls,job_payload,credits_used,credits_cost,ai_model,image_size,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    "recent generations aggregate",
    warnings,
    true,
  );
  return result.data || [];
}

async function loadUserGenerationStats(userIds: string[], warnings: string[]) {
  const stats = new Map<string, { count: number; latestAt: string | null }>();
  if (!userIds.length) return stats;

  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("generations")
      .select("user_id,created_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: false })
      .limit(2000),
    "user generation stats",
    warnings,
    true,
  );

  for (const row of result.data || []) {
    const userId = stringValue(row.user_id);
    if (!userId) continue;
    const current = stats.get(userId) || { count: 0, latestAt: null };
    current.count += 1;
    const createdAt = nullableString(row.created_at);
    if (createdAt && (!current.latestAt || Date.parse(createdAt) > Date.parse(current.latestAt))) {
      current.latestAt = createdAt;
    }
    stats.set(userId, current);
  }

  return stats;
}

async function loadUserWorkflowStats(userIds: string[], warnings: string[]) {
  const stats = new Map<string, number>();
  if (!userIds.length) return stats;

  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("agent_workflows")
      .select("user_id")
      .in("user_id", userIds)
      .limit(2000),
    "user workflow stats",
    warnings,
    true,
  );

  for (const row of result.data || []) {
    const userId = stringValue(row.user_id);
    if (!userId) continue;
    stats.set(userId, (stats.get(userId) || 0) + 1);
  }

  return stats;
}

async function loadFallbackTasks(
  args: { limit: number; status: TaskStatusGroup | ""; module: string; sourceType: string; q: string },
  warnings: string[],
) {
  const rows: AdminTaskListItem[] = [];
  const loadGenerations = !args.sourceType || args.sourceType === "generation";
  const loadWorkflows = !args.sourceType || args.sourceType === "workflow";

  if (loadGenerations) {
    let query = getAdminClient()
      .from("generations")
      .select(GENERATION_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(args.limit * 2);
    if (args.module) query = query.eq("job_payload->>kind", args.module);
    const generationResult = await runQuery<Record<string, unknown>[]>(query, "fallback generations", warnings, true);
    rows.push(...(generationResult.data || []).map(mapGenerationRow));
  }

  if (loadWorkflows && !args.module) {
    const workflowResult = await runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("agent_workflows")
        .select(WORKFLOW_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(args.limit),
      "fallback workflows",
      warnings,
      true,
    );
    rows.push(...(workflowResult.data || []).map(mapWorkflowRow));
  }

  let filtered = rows;
  if (args.status) filtered = filtered.filter((row) => row.statusGroup === args.status);
  if (args.q) filtered = filtered.filter((row) => matchesTaskSearch(row, args.q));
  filtered = filtered.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  return {
    rows: filtered.slice(0, args.limit),
    total: filtered.length,
  };
}

function mapTaskQueueRow(row: Record<string, unknown>): AdminTaskListItem {
  const sourceType = stringValue(row.source_type) === "workflow" ? "workflow" : "generation";
  const module = normalizeModuleFilter(stringValue(row.module)) || (sourceType === "workflow" ? "workflow" : "unknown");
  return {
    id: stringValue(row.id) || stringValue(row.source_id),
    sourceId: stringValue(row.source_id),
    sourceType,
    userId: stringValue(row.user_id),
    module,
    moduleLabel: moduleLabel(module),
    title: stringValue(row.title) || moduleLabel(module),
    status: stringValue(row.status) || stringValue(row.status_group),
    statusGroup: normalizeTaskStatusGroup(stringValue(row.status_group) || stringValue(row.status), numberValue(row.result_count)),
    progress: clampProgress(row.progress),
    expectedCount: Math.max(1, numberValue(row.expected_count) || 1),
    resultCount: Math.max(0, numberValue(row.result_count)),
    inputThumbnails: arrayOfStrings(row.input_thumbnails),
    resultThumbnails: arrayOfStrings(row.result_thumbnails),
    errorMessage: nullableString(row.error_message),
    applyUrl: stringValue(row.apply_url),
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
    completedAt: nullableString(row.completed_at),
  };
}

function mapGenerationRow(row: Record<string, unknown>): AdminTaskListItem {
  const payload = isRecord(row.job_payload) ? row.job_payload : {};
  const resultUrls = arrayOfStrings(row.result_urls);
  const module = normalizeModuleFilter(stringValue(payload.kind) || stringValue(payload.module) || inferModuleFromPayload(payload)) || "tryon";
  const status = stringValue(row.status) || "queued";
  const statusGroup = normalizeTaskStatusGroup(status, resultUrls.length);
  return {
    id: stringValue(row.id),
    sourceId: stringValue(row.id),
    sourceType: "generation",
    userId: stringValue(row.user_id),
    module,
    moduleLabel: moduleLabel(module),
    title: moduleLabel(module),
    status,
    statusGroup,
    progress: statusGroup === "completed" ? 100 : statusGroup === "failed" ? 0 : clampProgress(payload.progress || readAsyncTask(payload).progress || 12),
    expectedCount: inferExpectedCount(payload, resultUrls.length),
    resultCount: resultUrls.length,
    inputThumbnails: inferInputThumbnails(row, payload),
    resultThumbnails: resultUrls.slice(0, 4),
    errorMessage: nullableString(row.error_message),
    applyUrl: `${moduleRoute(module)}?apply=${encodeURIComponent(stringValue(row.id))}`,
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at) || nullableString(row.processing_started_at),
    completedAt: nullableString(row.completed_at),
    model: nullableString(row.ai_model) || nullableString(payload.aiModel),
    imageSize: nullableString(row.image_size) || nullableString(payload.imageSize),
    credits: numberValue(row.credits_used) || numberValue(row.credits_cost),
  };
}

function mapWorkflowRow(row: Record<string, unknown>): AdminTaskListItem {
  const status = stringValue(row.status) || "queued";
  const resultThumbnails = extractUrls(row.final_outputs).slice(0, 4);
  const statusGroup = normalizeTaskStatusGroup(status, resultThumbnails.length);
  return {
    id: stringValue(row.id),
    sourceId: stringValue(row.id),
    sourceType: "workflow",
    userId: stringValue(row.user_id),
    module: "workflow",
    moduleLabel: "Agent 工作流",
    title: stringValue(row.summary) || stringValue(row.intent) || "Agent 工作流",
    status,
    statusGroup,
    progress: statusGroup === "completed" ? 100 : statusGroup === "failed" ? 0 : 25,
    expectedCount: Math.max(1, resultThumbnails.length || 1),
    resultCount: resultThumbnails.length,
    inputThumbnails: extractUrls(row.input_images).slice(0, 4),
    resultThumbnails,
    errorMessage: nullableString(row.error_message),
    applyUrl: `/agent?workflow=${encodeURIComponent(stringValue(row.id))}`,
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
    completedAt: nullableString(row.completed_at),
    credits: numberValue(row.cost_settled) || numberValue(row.cost_reserved),
  };
}

async function countRows(query: CountQuery, label: string, warnings: string[], optional = false) {
  try {
    const response = await withTimeout(query, SHORT_QUERY_TIMEOUT_MS, `${label} timeout`) as {
      count?: number | null;
      error?: { message?: string; code?: string } | null;
    };
    const { count = null, error = null } = response;
    if (error) {
      if (!optional || !isMissingTableError(error)) warnings.push(`${label}: ${error.message || "query failed"}`);
      return 0;
    }
    return count || 0;
  } catch (error) {
    if (!optional) warnings.push(`${label}: ${toMessage(error)}`);
    return 0;
  }
}

async function runQuery<T>(
  query: SupabaseQuery,
  label: string,
  warnings: string[],
  optional = false,
): Promise<{ data: T | null; count: number | null; error: string | null }> {
  try {
    const response = await withTimeout(query, QUERY_TIMEOUT_MS, `${label} timeout`) as {
      data?: T | null;
      error?: { message?: string; code?: string } | null;
      count?: number | null;
    };
    const { data = null, error = null, count = null } = response;
    if (error) {
      if (!optional || !isMissingTableError(error)) warnings.push(`${label}: ${error.message || "query failed"}`);
      return { data: null, count: count ?? null, error: error.message || "query failed" };
    }
    return { data, count: count ?? null, error: null };
  } catch (error) {
    if (!optional) warnings.push(`${label}: ${toMessage(error)}`);
    return { data: null, count: null, error: toMessage(error) };
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function normalizeStatusFilter(value?: string): TaskStatusGroup | "" {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "queued" || normalized === "running" || normalized === "completed" || normalized === "failed") {
    return normalized;
  }
  return "";
}

function normalizeModuleFilter(value?: string) {
  const normalized = (value || "").trim();
  if (!normalized || normalized === "all") return "";
  return normalizeModule(normalized);
}

function normalizeTaskStatusGroup(status: string, resultCount = 0): TaskStatusGroup {
  const normalized = status.toLowerCase();
  if (normalized === "failed" || normalized === "timeout" || normalized === "cancelled" || normalized === "canceled") return "failed";
  if (normalized === "completed" || normalized === "success" || normalized === "succeeded" || resultCount > 0) return "completed";
  if (normalized === "queued" || normalized === "planned" || normalized === "needs_confirmation" || normalized === "confirmed" || normalized === "waiting_user") return "queued";
  if (normalized.startsWith("processing") || normalized === "running" || normalized === "generating" || normalized === "in_progress") return "running";
  return "queued";
}

export function moduleLabel(module: string) {
  const labels: Record<string, string> = {
    tryon: "服装上身",
    model: "专属模特",
    face: "换脸",
    faceSwap: "换脸",
    grass: "种草图",
    productSet: "商品套图",
    modelBackground: "模特换背景",
    garment3d: "服装 3D",
    generalImage: "通用生图",
    pose: "姿势裂变",
    workflow: "Agent 工作流",
    image: "图生图",
    unknown: "未知任务",
  };
  return labels[module] || module || "未知任务";
}

export function moduleRoute(module: string) {
  const routes: Record<string, string> = {
    tryon: "/create",
    model: "/model",
    face: "/face-swap",
    faceSwap: "/face-swap",
    grass: "/grass",
    productSet: "/product-set",
    modelBackground: "/model-background",
    garment3d: "/garment-3d",
    generalImage: "/general-image",
    pose: "/pose",
    workflow: "/agent",
  };
  return routes[module] || "/history";
}

function inferModuleFromPayload(payload: Record<string, unknown>) {
  if (payload.poseMode || payload.mainImageUrl || payload.poseReferenceUrls) return "pose";
  if (payload.productImageUrls || payload.productSetMode) return "productSet";
  if (payload.backgroundMode || payload.backgroundReferenceUrl) return "modelBackground";
  if (payload.garmentUrl && (payload.templateId || payload.changeModel)) return "grass";
  if (payload.garmentUrl) return "garment3d";
  if (payload.sourceUrl && payload.faceUrl) return "faceSwap";
  if (payload.referenceUrls && payload.gender) return "model";
  if (payload.mode && payload.prompt) return "generalImage";
  if (payload.clothingUrls || payload.clothingUrl) return "tryon";
  return "tryon";
}

function inferExpectedCount(payload: Record<string, unknown>, resultCount: number) {
  return Math.max(
    1,
    numberValue(payload.imageCount) ||
      numberValue(payload.genCount) ||
      numberValue(payload.count) ||
      numberValue(payload.n) ||
      resultCount ||
      1,
  );
}

function inferInputThumbnails(row: Record<string, unknown>, payload: Record<string, unknown>) {
  return uniqueStrings([
    ...arrayOfStrings(payload.clothingUrls),
    ...arrayOfStrings(payload.referenceUrls),
    ...arrayOfStrings(payload.productImageUrls),
    ...arrayOfStrings(payload.poseReferenceUrls),
    ...arrayOfStrings(payload.sceneImages),
    ...arrayOfStrings(payload.inputUrls),
    ...arrayOfStrings(row.clothing_urls),
    stringValue(payload.clothingUrl),
    stringValue(payload.referenceUrl),
    stringValue(payload.modelFaceUrl),
    stringValue(payload.sourceUrl),
    stringValue(payload.faceUrl),
    stringValue(payload.mainImageUrl),
    stringValue(payload.garmentUrl),
    stringValue(payload.backgroundReferenceUrl),
    stringValue(row.model_face_url),
    stringValue(row.reference_url),
  ]).slice(0, 6);
}

function readAsyncTask(payload: Record<string, unknown>) {
  const asyncTask = isRecord(payload.asyncTask) ? payload.asyncTask : {};
  return {
    progress: numberValue(asyncTask.progress),
    status: stringValue(asyncTask.status),
  };
}

function extractUrls(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return isUrl(value) ? [value] : [];
  if (Array.isArray(value)) return uniqueStrings(value.flatMap(extractUrls));
  if (!isRecord(value)) return [];
  return uniqueStrings([
    stringValue(value.url),
    stringValue(value.imageUrl),
    stringValue(value.outputUrl),
    stringValue(value.resultUrl),
    stringValue(value.selectedImageUrl),
    ...arrayOfStrings(value.urls),
    ...arrayOfStrings(value.images),
    ...arrayOfStrings(value.imageUrls),
    ...arrayOfStrings(value.resultUrls),
    ...arrayOfStrings(value.outputUrls),
  ]);
}

function matchesTaskSearch(row: AdminTaskListItem, q: string) {
  return [
    row.id,
    row.sourceId,
    row.userId,
    row.module,
    row.moduleLabel,
    row.title,
    row.status,
    row.errorMessage || "",
  ].some((value) => value.toLowerCase().includes(q));
}

function clampLimit(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function clampProgress(value: unknown) {
  const progress = numberValue(value);
  if (progress <= 0) return 0;
  if (progress >= 100) return 100;
  return Math.round(progress);
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const str = stringValue(value);
  return str || null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/");
}

function isMissingTableError(error: { code?: string; message?: string }) {
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist");
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
