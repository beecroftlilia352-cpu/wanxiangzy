import { CREDIT_COSTS, DEFAULT_LINGYA_MODEL, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import {
  type GptImageProviderName,
  type ModelRoutingConfig,
  type NanoBananaProviderName,
} from "@/lib/api/model-routing-config";
import { getActiveModelRoutingConfig } from "@/lib/api/model-routing-config.server";
// Agent module is temporarily disabled; eval cases are stubbed as empty.
// Restore the import from "@/lib/agent/brain/eval-cases" once the agent
// module is brought back from `refactor/extract-agent-module`.
type BrainEvalCase = never;
const BRAIN_EVAL_CASES: BrainEvalCase[] = [];
import { getConfiguredProcessorSecrets } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import type { TaskStatusGroup } from "@/lib/task-queue";
import { normalizeModule } from "@/lib/task-queue-index";
import { withTimeout, isRecord } from "@/lib/utils";
import type {
  AdminAssetLifecycleAction,
  AdminAssetLifecycleItem,
  AdminAssetLifecycleOverview,
  AdminAssetLifecyclePolicy,
  AdminAssetLifecycleStage,
  AdminAssetList,
  AdminAssetListItem,
  AdminAssetStorageProvider,
  AdminModerationCase,
  AdminModerationList,
} from "./assets";
import {
  BILLING_ORDERS_TABLE,
  BILLING_PRICES_TABLE,
  BILLING_PRODUCTS_TABLE,
  BILLING_SUBSCRIPTIONS_TABLE,
  BILLING_WEBHOOK_EVENTS_TABLE,
  type AdminBillingConfigStatus,
  type AdminBillingOrder,
  type AdminBillingOverview,
  type AdminBillingPrice,
  type AdminBillingProduct,
  type AdminBillingSubscription,
  type AdminBillingWebhookEvent,
} from "./billing";
import type { AdminCostBreakdownItem, AdminCostDailyItem, AdminCostReport } from "./reports";
import type { AdminBreakdownItem, AdminMetric } from "./shared";

export type {
  AdminAssetLifecycleAction,
  AdminAssetLifecycleItem,
  AdminAssetLifecycleOverview,
  AdminAssetLifecyclePolicy,
  AdminAssetLifecycleStage,
  AdminAssetList,
  AdminAssetListItem,
  AdminAssetStorageProvider,
  AdminModerationCase,
  AdminModerationList,
} from "./assets";
export type {
  AdminBillingConfigStatus,
  AdminBillingOrder,
  AdminBillingOverview,
  AdminBillingPrice,
  AdminBillingProduct,
  AdminBillingSubscription,
  AdminBillingWebhookEvent,
} from "./billing";
export type { AdminCostBreakdownItem, AdminCostDailyItem, AdminCostReport } from "./reports";
export type { AdminBreakdownItem, AdminMetric } from "./shared";

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

export type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  credits: number;
  totalCreditsUsed: number;
  accountStatus: AdminUserAccountStatus;
  generateEnabled: boolean;
  supportLevel: AdminUserSupportLevel;
  controlReason: string | null;
  controlNote: string | null;
  controlExpiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  generationCount: number;
  workflowCount: number;
  latestGenerationAt: string | null;
};

export type AdminUserAccountStatus = "active" | "restricted" | "suspended";

export type AdminUserSupportLevel = "standard" | "priority" | "watch";

export type AdminUserControl = {
  userId: string;
  status: AdminUserAccountStatus;
  generateEnabled: boolean;
  supportLevel: AdminUserSupportLevel;
  reason: string | null;
  note: string | null;
  expiresAt: string | null;
  updatedByEmail: string | null;
  updatedAt: string | null;
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
  isStale: boolean;
  staleMinutes: number;
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
  routing: {
    source: ModelRoutingConfig["source"];
    configKey: string;
    versionId?: string;
    publishedAt?: string | null;
    gptImageProvider: GptImageProviderName;
    nanoBananaProvider: NanoBananaProviderName;
  };
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

export type AdminOperationRequest = {
  id: string;
  requestType: string;
  status: string;
  requestedBy: string | null;
  requestedByEmail: string | null;
  requestedByRole: string | null;
  approvedBy: string | null;
  approvedByEmail: string | null;
  approvedByRole: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  riskLevel: "low" | "medium" | "high";
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  approvedAt: string | null;
};

export type AdminOperationRequestList = {
  rows: AdminOperationRequest[];
  available: boolean;
  warnings: string[];
};

export type AdminSupportTicketStatus = "open" | "pending" | "waiting_user" | "resolved" | "closed";
export type AdminSupportTicketPriority = "low" | "medium" | "high" | "urgent";
export type AdminSupportTicketCategory =
  | "generation_failure"
  | "credit_issue"
  | "content_moderation"
  | "billing"
  | "account"
  | "technical"
  | "other";

export type AdminSupportTicket = {
  id: string;
  ticketNo: string;
  status: AdminSupportTicketStatus;
  priority: AdminSupportTicketPriority;
  category: AdminSupportTicketCategory;
  source: string;
  userId: string | null;
  userEmail: string | null;
  generationId: string | null;
  assetSourceType: string | null;
  assetSourceId: string | null;
  title: string;
  description: string;
  resolution: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  assignedTo: string | null;
  assignedToEmail: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  createdByRole: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminSupportTicketList = {
  rows: AdminSupportTicket[];
  available: boolean;
  total: number;
  metrics: {
    open: number;
    pending: number;
    waitingUser: number;
    resolved: number;
    closed: number;
    urgent: number;
    linkedGenerations: number;
  };
  warnings: string[];
};

export type AdminSavedView = {
  id: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  name: string;
  resource: string;
  visibility: "private" | "team";
  filters: Record<string, unknown>;
  columns: unknown[];
  sort: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminSavedViewList = {
  rows: AdminSavedView[];
  available: boolean;
  warnings: string[];
};

export type AdminExportJob = {
  id: string;
  exportType: string;
  status: string;
  requestedBy: string | null;
  requestedByEmail: string | null;
  requestedByRole: string | null;
  filters: Record<string, unknown>;
  rowCount: number;
  downloadToken: string;
  expiresAt: string | null;
  errorMessage: string | null;
  createdAt: string | null;
};

export type AdminExportJobList = {
  rows: AdminExportJob[];
  available: boolean;
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

export type AdminPromptExperimentStatus = "draft" | "running" | "paused" | "completed";

export type AdminPromptExperimentVariant = {
  key: string;
  label: string;
  weight: number;
  template: string;
  notes: string | null;
};

export type AdminPromptExperiment = {
  id: string;
  name: string;
  module: string;
  moduleLabel: string;
  status: AdminPromptExperimentStatus;
  traffic: number;
  primaryMetric: string;
  guardrails: string[];
  variants: AdminPromptExperimentVariant[];
  owner: string | null;
  notes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  versionId: string;
  versionStatus: string;
  versionCreatedAt: string | null;
  versionPublishedAt: string | null;
};

export type AdminPromptExperimentOverview = {
  available: boolean;
  configKey: "prompt.experiments";
  activeVersion: AdminConfigVersion | null;
  draftVersions: AdminConfigVersion[];
  archivedVersions: AdminConfigVersion[];
  experiments: AdminPromptExperiment[];
  metrics: {
    total: number;
    running: number;
    draft: number;
    paused: number;
    completed: number;
    coveredModules: number;
    variants: number;
    averageTraffic: number;
  };
  warnings: string[];
  exampleValue: Record<string, unknown>;
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

export type AdminWorkerProcessor = {
  key: "generations" | "agent-workflows" | "agent-evals";
  label: string;
  endpoint: string;
  configured: boolean;
  batchSize: number;
  secretNames: string[];
  statusHint: string;
};

export type AdminWorkerOverview = {
  processors: AdminWorkerProcessor[];
  queue: {
    sampled: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    stale: number;
    staleMinutes: number;
  };
  staleTasks: AdminTaskListItem[];
  recentRuns: AdminAuditLog[];
  warnings: string[];
};

export type AdminAgentEvalRunStatus = "pass" | "failed" | "empty";

export type AdminAgentEvalRun = {
  id: string;
  userId: string;
  email: string | null;
  total: number;
  passed: number;
  failed: number;
  score: number;
  latencyMs: number;
  status: AdminAgentEvalRunStatus;
  summary: Record<string, unknown>;
  createdAt: string | null;
};

export type AdminAgentEvalResult = {
  id: string;
  runId: string;
  userId: string;
  email: string | null;
  caseId: string;
  title: string;
  ok: boolean;
  failures: string[];
  action: string | null;
  module: string | null;
  confidence: number;
  traceId: string | null;
  createdAt: string | null;
};

export type AdminAgentEvalCase = {
  id: string;
  title: string;
  expected: string[];
  imageCount: number;
};

export type AdminAgentEvalOverview = {
  available: boolean;
  generatedAt: string;
  processor: AdminWorkerProcessor;
  metrics: {
    totalRuns: number;
    recentRuns: number;
    avgScore: number;
    passRate: number;
    failedRuns: number;
    failedCases: number;
    uniqueUsers: number;
    averageLatencyMs: number;
    latestRunAt: string | null;
  };
  runs: AdminAgentEvalRun[];
  failures: AdminAgentEvalResult[];
  baselineCases: AdminAgentEvalCase[];
  warnings: string[];
};

export type AdminDiagnosticSeverity = "critical" | "warning" | "info";

export type AdminDiagnosticItem = {
  id: string;
  severity: AdminDiagnosticSeverity;
  category: "queue" | "worker" | "finance" | "content" | "approval" | "provider" | "data";
  title: string;
  summary: string;
  impact: string;
  recommendation: string;
  evidence: Array<{ label: string; value: string | number }>;
  links: Array<{ href: string; label: string }>;
  createdAt: string;
};

export type AdminDiagnosticsReport = {
  generatedAt: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  items: AdminDiagnosticItem[];
  warnings: string[];
};

export type AdminRiskLevel = "low" | "medium" | "high" | "critical";

export type AdminRiskSignal = {
  key: string;
  label: string;
  severity: AdminRiskLevel;
  score: number;
  detail: string;
  evidence: Array<{ label: string; value: string | number }>;
};

export type AdminRiskUserItem = {
  userId: string;
  email: string | null;
  displayName: string | null;
  credits: number;
  totalCreditsUsed: number;
  generationCount: number;
  failedGenerations: number;
  refundCredits: number;
  adjustmentCredits: number;
  moderationHits: number;
  supportTickets: number;
  urgentSupportTickets: number;
  latestActivityAt: string | null;
  score: number;
  level: AdminRiskLevel;
  signals: AdminRiskSignal[];
  recommendedAction: string;
  detailUrl: string;
};

export type AdminRiskPolicy = {
  id: string;
  title: string;
  description: string;
  score: number;
  level: AdminRiskLevel;
};

export type AdminRiskOverview = {
  generatedAt: string;
  days: number;
  rows: AdminRiskUserItem[];
  policies: AdminRiskPolicy[];
  metrics: {
    sampledUsers: number;
    criticalUsers: number;
    highUsers: number;
    mediumUsers: number;
    failedGenerations: number;
    refundCredits: number;
    moderationHits: number;
    urgentSupportTickets: number;
    averageScore: number;
  };
  warnings: string[];
};

type CountQuery = PromiseLike<unknown>;
type SupabaseQuery = PromiseLike<unknown>;

const QUERY_TIMEOUT_MS = 7_000;
const SHORT_QUERY_TIMEOUT_MS = 3_500;
const PROFILE_COLUMNS = "id,email,display_name,credits,total_credits_used,created_at,updated_at";
const PROFILE_COLUMNS_FALLBACK = "id,email,display_name,credits,created_at,updated_at";
const ADMIN_STALE_TASK_MINUTES = 20;
const ADMIN_USER_CONTROL_COLUMNS = [
  "user_id",
  "status",
  "generate_enabled",
  "support_level",
  "reason",
  "note",
  "expires_at",
  "updated_by_email",
  "updated_at",
].join(",");
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
const ADMIN_TASK_PREVIEW_LIMIT = 4;
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
const MODERATION_CASE_COLUMNS = "id,source_type,source_id,action,status,reason,metadata,created_by,created_at,resolved_at";
const OPERATION_REQUEST_COLUMNS = [
  "id",
  "request_type",
  "status",
  "requested_by",
  "requested_by_email",
  "requested_by_role",
  "approved_by",
  "approved_by_email",
  "approved_by_role",
  "target_type",
  "target_id",
  "reason",
  "risk_level",
  "payload",
  "result",
  "created_at",
  "updated_at",
  "approved_at",
].join(",");
const SUPPORT_TICKET_COLUMNS = [
  "id",
  "ticket_no",
  "status",
  "priority",
  "category",
  "source",
  "user_id",
  "user_email",
  "generation_id",
  "asset_source_type",
  "asset_source_id",
  "title",
  "description",
  "resolution",
  "tags",
  "metadata",
  "assigned_to",
  "assigned_to_email",
  "created_by",
  "created_by_email",
  "created_by_role",
  "resolved_at",
  "created_at",
  "updated_at",
].join(",");
const SAVED_VIEW_COLUMNS = "id,owner_user_id,owner_email,name,resource,visibility,filters,columns,sort,created_at,updated_at";
const EXPORT_JOB_COLUMNS = "id,export_type,status,requested_by,requested_by_email,requested_by_role,filters,row_count,download_token,expires_at,error_message,created_at";
const AGENT_EVAL_RUN_COLUMNS = "id,user_id,total,passed,failed,score,latency_ms,summary,created_at";
const AGENT_EVAL_RESULT_COLUMNS = "id,run_id,user_id,case_id,title,ok,failures,action,module,confidence,trace_id,created_at";
export const PROMPT_EXPERIMENT_CONFIG_KEY = "prompt.experiments" as const;
export const DEFAULT_PROMPT_EXPERIMENT_CONFIG = {
  schemaVersion: 1,
  assignment: {
    stickyKey: "user_id",
    method: "hash_bucket",
  },
  experiments: [
    {
      id: "pose-prompt-v2",
      name: "姿势裂变 Prompt V2",
      module: "pose",
      status: "draft",
      traffic: 10,
      primaryMetric: "success_rate",
      guardrails: ["agent_eval_score >= 90", "failed_case_count = 0", "refund_rate <= control"],
      variants: [
        {
          key: "control",
          label: "线上模板",
          weight: 50,
          template: "保持当前生产提示词，不改变人物身份、服装结构和画幅。",
          notes: "对照组",
        },
        {
          key: "variant-a",
          label: "姿势多样性增强",
          weight: 50,
          template: "在保持人物身份、服装结构和画幅不变的前提下，生成更明显区分的自然站姿、半身转体和轻微动态姿势。",
          notes: "实验组",
        },
      ],
      owner: "ops",
      notes: "发布前需要先通过回归评测。",
      startedAt: null,
      endedAt: null,
    },
  ],
};

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
      { label: "样本灵点余额", value: creditHealth.sampledBalance, hint: `近 7 天消耗 ${creditHealth.recentSpend}`, tone: "neutral" },
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

export async function getAdminCostReport(args: { days?: number } = {}): Promise<AdminCostReport> {
  const admin = getAdminClient();
  const warnings: string[] = [];
  const days = clampLimit(args.days, 1, 90, 14);
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [generationResult, creditLogResult, workflowResult] = await Promise.all([
    runQuery<Record<string, unknown>[]>(
      admin
        .from("generations")
        .select(GENERATION_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(2500),
      "cost report generations",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin
        .from("credit_logs")
        .select(CREDIT_LOG_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(4000),
      "cost report credit logs",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin
        .from("agent_workflows")
        .select(WORKFLOW_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1500),
      "cost report workflows",
      warnings,
      true,
    ),
  ]);

  const creditLogs = creditLogResult.data || [];
  const generations = generationResult.data || [];
  const workflows = workflowResult.data || [];
  const debitsByGeneration = new Map<string, number>();
  const refundsByGeneration = new Map<string, number>();
  let grossCredits = 0;
  let refundCredits = 0;
  let adjustmentCredits = 0;

  for (const row of creditLogs) {
    const amount = numberValue(row.amount);
    const generationId = nullableString(row.generation_id);
    if (amount < 0) {
      const debit = Math.abs(amount);
      grossCredits += debit;
      if (generationId) debitsByGeneration.set(generationId, (debitsByGeneration.get(generationId) || 0) + debit);
    } else if (amount > 0 && generationId) {
      refundCredits += amount;
      refundsByGeneration.set(generationId, (refundsByGeneration.get(generationId) || 0) + amount);
    } else if (amount > 0) {
      adjustmentCredits += amount;
    }
  }

  const modules = new Map<string, AdminCostBreakdownItem>();
  const models = new Map<string, AdminCostBreakdownItem>();
  const daily = createCostDailyMap(since, days);
  let generationReservedCredits = 0;
  let generationSettledCredits = 0;
  let inFlightCredits = 0;
  let failedReservedCredits = 0;
  let completedCount = 0;
  let failedCount = 0;
  let runningCount = 0;

  for (const row of generations) {
    const payload = isRecord(row.job_payload) ? row.job_payload : {};
    const id = stringValue(row.id);
    const resultCount = arrayOfStrings(row.result_urls).length;
    const module = normalizeModuleFilter(stringValue(payload.kind) || stringValue(payload.module) || inferModuleFromPayload(payload)) || "tryon";
    const model = stringValue(row.ai_model) || stringValue(payload.aiModel) || "unknown";
    const statusGroup = normalizeTaskStatusGroup(stringValue(row.status), resultCount);
    const reservedCredits = Math.max(0, numberValue(row.credits_cost));
    const rawUsed = Math.max(0, numberValue(row.credits_used));
    const settledCredits = statusGroup === "completed" ? (rawUsed || reservedCredits) : 0;
    const debitCredits = debitsByGeneration.get(id) || reservedCredits;
    const inferredRefund = statusGroup === "failed" || statusGroup === "completed"
      ? Math.max(0, reservedCredits - settledCredits)
      : 0;
    const generationRefund = refundsByGeneration.get(id) ?? inferredRefund;
    const netCredits = Math.max(0, debitCredits - generationRefund);
    const rowInFlight = statusGroup === "queued" || statusGroup === "running" ? reservedCredits : 0;
    const rowFailedReserved = statusGroup === "failed" ? reservedCredits : 0;

    generationReservedCredits += reservedCredits;
    generationSettledCredits += settledCredits;
    inFlightCredits += rowInFlight;
    failedReservedCredits += rowFailedReserved;
    if (statusGroup === "completed") completedCount += 1;
    if (statusGroup === "failed") failedCount += 1;
    if (statusGroup === "queued" || statusGroup === "running") runningCount += 1;

    const snapshot = {
      count: 1,
      completed: statusGroup === "completed" ? 1 : 0,
      failed: statusGroup === "failed" ? 1 : 0,
      running: statusGroup === "queued" || statusGroup === "running" ? 1 : 0,
      grossCredits: debitCredits,
      refundCredits: generationRefund,
      netCredits,
      settledCredits,
      inFlightCredits: rowInFlight,
      marginCredits: netCredits - settledCredits,
    };
    bumpCostBreakdown(modules, module, moduleLabel(module), snapshot);
    bumpCostBreakdown(models, model, model, snapshot);
    bumpDailyGeneration(daily, nullableString(row.created_at), {
      settledCredits,
      failed: statusGroup === "failed" ? 1 : 0,
    });
  }

  let workflowReservedCredits = 0;
  let workflowSettledCredits = 0;
  for (const row of workflows) {
    const statusGroup = normalizeTaskStatusGroup(stringValue(row.status));
    const reservedCredits = Math.max(0, numberValue(row.cost_reserved));
    const settledCredits = statusGroup === "completed"
      ? Math.max(0, numberValue(row.cost_settled) || reservedCredits)
      : Math.max(0, numberValue(row.cost_settled));
    workflowReservedCredits += reservedCredits;
    workflowSettledCredits += settledCredits;
    if (statusGroup === "completed") completedCount += 1;
    if (statusGroup === "failed") failedCount += 1;
    if (statusGroup === "queued" || statusGroup === "running") runningCount += 1;
    bumpDailyWorkflow(daily, nullableString(row.created_at), settledCredits);
  }

  for (const row of creditLogs) {
    bumpDailyCreditLog(daily, nullableString(row.created_at), row);
  }

  const netCredits = Math.max(0, grossCredits - refundCredits);
  const fulfillmentCredits = generationSettledCredits + workflowSettledCredits;
  const marginCredits = netCredits - fulfillmentCredits;
  const sortedModules = finalizeCostBreakdowns(modules);
  const sortedModels = finalizeCostBreakdowns(models);

  return {
    days,
    since: sinceIso,
    until: until.toISOString(),
    metrics: {
      grossCredits,
      refundCredits,
      adjustmentCredits,
      netCredits,
      generationReservedCredits,
      generationSettledCredits,
      workflowReservedCredits,
      workflowSettledCredits,
      inFlightCredits,
      failedReservedCredits,
      marginCredits,
      marginRate: netCredits > 0 ? marginCredits / netCredits : 0,
      generationCount: generations.length,
      workflowCount: workflows.length,
      completedCount,
      failedCount,
      runningCount,
    },
    modules: sortedModules,
    models: sortedModels,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    assumptions: [
      "收入使用 credit_logs 中 amount < 0 的灵点扣费作为收入代理。",
      "退款使用带 generation_id 的正向 credit_logs；老数据缺少流水时按 credits_cost - credits_used 推断。",
      "真实 provider 账单尚未接入，本报表的成本为灵点履约口径，可用于运营毛利代理和异常排查。",
    ],
    warnings: uniqueStrings(warnings),
  };
}

export async function getAdminDiagnostics(): Promise<AdminDiagnosticsReport> {
  const generatedAt = new Date().toISOString();
  const [
    overview,
    workers,
    costReport,
    moderation,
    pendingRequests,
    failedTasks,
  ] = await Promise.all([
    getAdminOverview(),
    getAdminWorkerOverview(),
    getAdminCostReport({ days: 7 }),
    listAdminModerationCases({ limit: 60 }),
    listAdminOperationRequests({ status: "pending", limit: 40 }),
    listAdminTasks({ status: "failed", limit: 50 }),
  ]);
  const providerCatalog = await getAdminProviderCatalog();
  const items: AdminDiagnosticItem[] = [];

  pushDiagnostic(items, {
    id: "queue-stale",
    severity: workers.queue.stale >= 3 ? "critical" : workers.queue.stale > 0 ? "warning" : null,
    category: "queue",
    title: "存在长时间未完成任务",
    summary: `${workers.queue.stale} 个任务运行超过 ${workers.queue.staleMinutes} 分钟无进展。`,
    impact: "用户侧会持续看到处理中，可能重复轮询并引发投诉。",
    recommendation: "进入任务队列页面查看样本，先确认模型通道状态和灵点结算，再手动重新处理或做定向退款处理。",
    evidence: [
      { label: "长时间未完成", value: workers.queue.stale },
      { label: "阈值分钟", value: workers.queue.staleMinutes },
      { label: "采样任务", value: workers.queue.sampled },
    ],
    links: [
      { href: "/admin/workers", label: "查看任务队列" },
      { href: "/admin/generations?status=running", label: "运行中任务" },
    ],
    createdAt: generatedAt,
  });

  const backlog = workers.queue.queued + workers.queue.running;
  pushDiagnostic(items, {
    id: "queue-backlog",
    severity: backlog >= 80 ? "critical" : backlog >= 20 ? "warning" : null,
    category: "queue",
    title: "队列积压偏高",
    summary: `当前队列中排队/运行任务合计 ${backlog} 个。`,
    impact: "生成等待时间会拉长，用户可能反复提交或刷新。",
    recommendation: "确认处理服务配置、模型通道可用性和任务失败分布；必要时提高处理频率或临时关闭高成本模型。",
    evidence: [
      { label: "排队中", value: workers.queue.queued },
      { label: "运行中", value: workers.queue.running },
      { label: "失败", value: workers.queue.failed },
    ],
    links: [
      { href: "/admin/workers", label: "任务队列" },
      { href: "/admin/providers", label: "模型通道健康" },
    ],
    createdAt: generatedAt,
  });

  pushDiagnostic(items, {
    id: "generation-failure-rate",
    severity: overview.generationHealth.failureRate >= 0.08 ? "critical" : overview.generationHealth.failureRate >= 0.03 ? "warning" : null,
    category: "provider",
    title: "生成失败率升高",
    summary: `当前累计失败率 ${Math.round(overview.generationHealth.failureRate * 1000) / 10}%。`,
    impact: "会增加退款、占用处理队列，并拉低近期产出质量。",
    recommendation: "按失败任务列表聚合功能模块和模型，优先检查最近模型通道错误、提示词变更和素材可访问性。",
    evidence: [
      { label: "生成总数", value: overview.generationHealth.total },
      { label: "失败任务", value: overview.generationHealth.failed },
      { label: "失败样本", value: failedTasks.rows.length },
    ],
    links: [
      { href: "/admin/generations?status=failed", label: "失败任务" },
      { href: "/admin/reports", label: "成本报表" },
    ],
    createdAt: generatedAt,
  });

  const missingProcessors = workers.processors.filter((processor) => !processor.configured);
  pushDiagnostic(items, {
    id: "worker-secret-missing",
    severity: missingProcessors.length ? "critical" : null,
    category: "worker",
    title: "处理服务配置未完整",
    summary: `${missingProcessors.length} 条处理服务缺少可用配置。`,
    impact: "定时任务或手动触发会失败，队列无法稳定消化。",
    recommendation: "补齐对应运行配置后重启服务，再在任务队列页面手动触发一次验证。",
    evidence: missingProcessors.map((processor) => ({ label: processor.key, value: processor.secretNames.join(" / ") })),
    links: [
      { href: "/admin/workers", label: "处理服务健康" },
      { href: "/admin/settings", label: "运行时配置" },
    ],
    createdAt: generatedAt,
  });

  const pendingModeration = moderation.rows.filter((row) => !row.resolvedAt && row.status !== "resolved");
  const escalatedModeration = pendingModeration.filter((row) => row.action === "escalate");
  pushDiagnostic(items, {
    id: "moderation-pending",
    severity: escalatedModeration.length >= 5 ? "critical" : pendingModeration.length >= 5 ? "warning" : null,
    category: "content",
    title: "内容审核积压",
    summary: `${pendingModeration.length} 条审核案件未解决，其中 ${escalatedModeration.length} 条需要复核。`,
    impact: "违规结果可能停留在作品库，或正常素材无法恢复展示。",
    recommendation: "优先处理 escalate 和 hide 相关案件，确保下架结果在历史列表与任务队列中同步过滤。",
    evidence: [
      { label: "pending", value: pendingModeration.length },
      { label: "escalated", value: escalatedModeration.length },
      { label: "available", value: moderation.available ? "yes" : "no" },
    ],
    links: [
      { href: "/admin/moderation", label: "审核中心" },
      { href: "/admin/assets", label: "资产列表" },
    ],
    createdAt: generatedAt,
  });

  const highRiskRequests = pendingRequests.rows.filter((row) => row.riskLevel === "high");
  pushDiagnostic(items, {
    id: "operation-requests-pending",
    severity: highRiskRequests.length > 0 ? "critical" : pendingRequests.rows.length >= 5 ? "warning" : null,
    category: "approval",
    title: "高危审批待处理",
    summary: `${pendingRequests.rows.length} 条操作审批待处理，其中 ${highRiskRequests.length} 条高风险。`,
    impact: "补偿、下架、配置变更等操作可能停在半路，影响用户恢复或运营 SLA。",
    recommendation: "Finance/Owner 优先处理高风险和超过当天的审批单；低风险可批量复核原因后通过。",
    evidence: [
      { label: "pending", value: pendingRequests.rows.length },
      { label: "highRisk", value: highRiskRequests.length },
      { label: "available", value: pendingRequests.available ? "yes" : "no" },
    ],
    links: [
      { href: "/admin/requests?status=pending", label: "审批中心" },
      { href: "/admin/audit", label: "审计日志" },
    ],
    createdAt: generatedAt,
  });

  pushDiagnostic(items, {
    id: "refund-ratio",
    severity: costReport.metrics.netCredits > 0 && costReport.metrics.refundCredits / costReport.metrics.netCredits >= 0.2
      ? "warning"
      : null,
    category: "finance",
    title: "退款占比偏高",
    summary: `近 7 天退款 ${costReport.metrics.refundCredits} 灵点，净收入 ${costReport.metrics.netCredits} 灵点。`,
    impact: "高退款通常对应模型通道不稳定、部分失败结算或误扣费体验问题。",
    recommendation: "在成本报表中按模块和模型拆分，优先修复退款贡献最高的模块。",
    evidence: [
      { label: "退款灵点", value: costReport.metrics.refundCredits },
      { label: "净收入灵点", value: costReport.metrics.netCredits },
      { label: "失败锁定灵点", value: costReport.metrics.failedReservedCredits },
    ],
    links: [
      { href: "/admin/reports?days=7", label: "近 7 天报表" },
      { href: "/admin/credits", label: "灵点流水" },
    ],
    createdAt: generatedAt,
  });

  const missingProviders = providerCatalog.models.filter((model) => !model.configured);
  pushDiagnostic(items, {
    id: "provider-config-missing",
    severity: missingProviders.length ? "warning" : null,
    category: "provider",
    title: "模型通道配置不完整",
    summary: `${missingProviders.length} 个模型缺少可用通道配置。`,
    impact: "用户选择相关模型时会失败，或降级路径无法覆盖。",
    recommendation: "补齐模型通道配置，或在模型路由配置中临时关闭未配置模型。",
    evidence: missingProviders.map((model) => ({ label: model.model, value: model.provider })),
    links: [
      { href: "/admin/providers", label: "模型供应商" },
      { href: "/admin/settings", label: "配置版本" },
    ],
    createdAt: generatedAt,
  });

  const dataWarnings = uniqueStrings([
    ...overview.warnings,
    ...workers.warnings,
    ...costReport.warnings,
    ...moderation.warnings,
    ...pendingRequests.warnings,
    ...failedTasks.warnings,
  ]);
  pushDiagnostic(items, {
    id: "admin-data-warnings",
    severity: dataWarnings.length ? "info" : null,
    category: "data",
    title: "后台数据源存在提示",
    summary: `本次诊断收集到 ${dataWarnings.length} 条数据源提示。`,
    impact: "部分统计表或可选表缺失时，诊断会退回样本估算。",
    recommendation: "优先完成后台管理数据初始化，并确认生产环境管理服务权限。",
    evidence: dataWarnings.slice(0, 6).map((warning, index) => ({ label: `warning_${index + 1}`, value: warning })),
    links: [
      { href: "/admin/settings", label: "运行时配置" },
      { href: "/admin/workers", label: "处理服务健康" },
    ],
    createdAt: generatedAt,
  });

  const sortedItems = items.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return {
    generatedAt,
    summary: {
      total: sortedItems.length,
      critical: sortedItems.filter((item) => item.severity === "critical").length,
      warning: sortedItems.filter((item) => item.severity === "warning").length,
      info: sortedItems.filter((item) => item.severity === "info").length,
    },
    items: sortedItems,
    warnings: dataWarnings,
  };
}

export async function getAdminRiskOverview(args: {
  q?: string;
  level?: string;
  days?: number;
  limit?: number;
} = {}): Promise<AdminRiskOverview> {
  const warnings: string[] = [];
  const admin = getAdminClient();
  const days = clampRiskDays(args.days);
  const limit = clampLimit(args.limit, 10, 160, 80);
  const q = (args.q || "").trim().toLowerCase();
  const level = normalizeRiskLevel(args.level);
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  let profileQuery = admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(Math.min(limit * 4, 500));
  if (q) profileQuery = profileQuery.ilike("email", `%${q}%`);

  let profileResult = await runQuery<Record<string, unknown>[]>(
    profileQuery,
    "risk profiles",
    warnings,
    true,
  );
  if (!profileResult.data && profileResult.error?.toLowerCase().includes("total_credits_used")) {
    let fallbackQuery = admin
      .from("profiles")
      .select(PROFILE_COLUMNS_FALLBACK)
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit * 4, 500));
    if (q) fallbackQuery = fallbackQuery.ilike("email", `%${q}%`);
    profileResult = await runQuery<Record<string, unknown>[]>(
      fallbackQuery,
      "risk profiles fallback",
      warnings,
      true,
    );
  }

  const [generationResult, creditResult, moderationResult, supportResult] = await Promise.all([
    runQuery<Record<string, unknown>[]>(
      admin
        .from("generations")
        .select("id,user_id,status,result_urls,credits_used,credits_cost,created_at,updated_at,completed_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(2500),
      "risk generations",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin
        .from("credit_logs")
        .select(CREDIT_LOG_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(2500),
      "risk credit logs",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin
        .from("moderation_cases")
        .select(MODERATION_CASE_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000),
      "risk moderation cases",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin
        .from("admin_support_tickets")
        .select(SUPPORT_TICKET_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000),
      "risk support tickets",
      warnings,
      true,
    ),
  ]);

  const profileMap = new Map<string, AdminUserListItem>();
  for (const row of profileResult.data || []) {
    const profile = mapProfileRow(row);
    if (profile.id) profileMap.set(profile.id, profile);
  }

  const stats = new Map<string, RiskUserStats>();
  const generationOwnerMap = new Map<string, string>();
  for (const row of generationResult.data || []) {
    const userId = stringValue(row.user_id);
    const generationId = stringValue(row.id);
    if (!userId) continue;
    if (generationId) generationOwnerMap.set(generationId, userId);
    const stat = getRiskStats(stats, userId);
    const resultCount = arrayOfStrings(row.result_urls).length;
    const statusGroup = normalizeTaskStatusGroup(stringValue(row.status), resultCount);
    stat.generationCount += 1;
    if (statusGroup === "failed") stat.failedGenerations += 1;
    stat.generationCredits += Math.max(0, numberValue(row.credits_used) || numberValue(row.credits_cost));
    stat.latestActivityAt = latestDate(stat.latestActivityAt, nullableString(row.updated_at) || nullableString(row.completed_at) || nullableString(row.created_at));
  }

  for (const row of creditResult.data || []) {
    const userId = stringValue(row.user_id);
    if (!userId) continue;
    const stat = getRiskStats(stats, userId);
    const amount = numberValue(row.amount);
    const reason = stringValue(row.reason).toLowerCase();
    if (amount > 0 && (stringValue(row.generation_id) || /refund|compens|退|补偿|失败/.test(reason))) {
      stat.refundCredits += amount;
    }
    if (/admin|manual|adjust|后台|人工|客服|补偿/.test(reason)) {
      stat.adjustmentCredits += Math.abs(amount);
    }
    stat.latestActivityAt = latestDate(stat.latestActivityAt, nullableString(row.created_at));
  }

  for (const row of moderationResult.data || []) {
    const action = stringValue(row.action);
    if (action !== "hide" && action !== "escalate") continue;
    const userId = generationOwnerMap.get(stringValue(row.source_id));
    if (!userId) continue;
    const stat = getRiskStats(stats, userId);
    stat.moderationHits += action === "hide" ? 2 : 1;
    stat.latestActivityAt = latestDate(stat.latestActivityAt, nullableString(row.created_at));
  }

  for (const row of supportResult.data || []) {
    const userId = stringValue(row.user_id);
    if (!userId) continue;
    const stat = getRiskStats(stats, userId);
    const status = stringValue(row.status);
    if (status !== "resolved" && status !== "closed") stat.supportTickets += 1;
    if (stringValue(row.priority) === "urgent") stat.urgentSupportTickets += 1;
    stat.latestActivityAt = latestDate(stat.latestActivityAt, nullableString(row.updated_at) || nullableString(row.created_at));
  }

  for (const userId of stats.keys()) {
    if (!profileMap.has(userId)) {
      profileMap.set(userId, {
        id: userId,
        email: "",
        displayName: null,
        credits: 0,
        totalCreditsUsed: 0,
        accountStatus: "active",
        generateEnabled: true,
        supportLevel: "standard",
        controlReason: null,
        controlNote: null,
        controlExpiresAt: null,
        createdAt: null,
        updatedAt: null,
        generationCount: 0,
        workflowCount: 0,
        latestGenerationAt: null,
      });
    }
  }

  let rows = Array.from(profileMap.values()).map((profile) => buildRiskUserItem(profile, stats.get(profile.id) || createRiskStats()));
  if (q) rows = rows.filter((row) => matchesRiskSearch(row, q));
  if (level) rows = rows.filter((row) => row.level === level);
  rows = rows.sort((a, b) => b.score - a.score || Date.parse(b.latestActivityAt || "") - Date.parse(a.latestActivityAt || "")).slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    days,
    rows,
    policies: RISK_SCORE_POLICIES,
    metrics: createRiskMetrics(rows),
    warnings: uniqueStrings(warnings),
  };
}

type RiskUserStats = {
  generationCount: number;
  failedGenerations: number;
  generationCredits: number;
  refundCredits: number;
  adjustmentCredits: number;
  moderationHits: number;
  supportTickets: number;
  urgentSupportTickets: number;
  latestActivityAt: string | null;
};

const RISK_SCORE_POLICIES: AdminRiskPolicy[] = [
  {
    id: "moderation",
    title: "内容风险",
    description: "审核下架和升级复核是最高优先级风险信号，需先确认是否需要限制公开展示。",
    score: 35,
    level: "critical",
  },
  {
    id: "refunds",
    title: "退款/补偿异常",
    description: "短期内多次退款、补偿或人工调整，优先核对任务失败原因与灵点流水。",
    score: 30,
    level: "high",
  },
  {
    id: "failure-rate",
    title: "生成失败异常",
    description: "任务量足够时失败率偏高，可能意味着素材质量、提示词、provider 或滥用问题。",
    score: 30,
    level: "high",
  },
  {
    id: "support",
    title: "客服压力",
    description: "未完结工单和紧急工单会抬高风险分，避免重复补偿或遗漏用户承诺。",
    score: 25,
    level: "medium",
  },
];

function createRiskStats(): RiskUserStats {
  return {
    generationCount: 0,
    failedGenerations: 0,
    generationCredits: 0,
    refundCredits: 0,
    adjustmentCredits: 0,
    moderationHits: 0,
    supportTickets: 0,
    urgentSupportTickets: 0,
    latestActivityAt: null,
  };
}

function getRiskStats(map: Map<string, RiskUserStats>, userId: string) {
  const existing = map.get(userId);
  if (existing) return existing;
  const created = createRiskStats();
  map.set(userId, created);
  return created;
}

function buildRiskUserItem(profile: AdminUserListItem, stats: RiskUserStats): AdminRiskUserItem {
  const signals: AdminRiskSignal[] = [];
  const failedRate = stats.generationCount > 0 ? stats.failedGenerations / stats.generationCount : 0;

  if (profile.credits < 0) {
    signals.push({
      key: "negative_balance",
      label: "余额为负",
      severity: "critical",
      score: 35,
      detail: "用户灵点余额为负，需要核对扣费、退款或人工调整链路。",
      evidence: [{ label: "credits", value: profile.credits }],
    });
  }
  if (stats.moderationHits >= 3) {
    signals.push({
      key: "moderation_high",
      label: "多次审核命中",
      severity: "critical",
      score: 35,
      detail: "近期存在多次下架或升级复核，建议优先人工复查内容和账户行为。",
      evidence: [{ label: "hits", value: stats.moderationHits }],
    });
  } else if (stats.moderationHits > 0) {
    signals.push({
      key: "moderation",
      label: "审核命中",
      severity: "high",
      score: 20,
      detail: "近期存在下架或复核记录，建议跟进内容安全上下文。",
      evidence: [{ label: "hits", value: stats.moderationHits }],
    });
  }
  if (stats.generationCount >= 5 && failedRate >= 0.6) {
    signals.push({
      key: "failure_rate",
      label: "失败率偏高",
      severity: "high",
      score: 30,
      detail: "生成任务失败率超过 60%，需确认素材质量、provider 或重复提交行为。",
      evidence: [
        { label: "failed", value: stats.failedGenerations },
        { label: "total", value: stats.generationCount },
      ],
    });
  } else if (stats.failedGenerations >= 10) {
    signals.push({
      key: "failure_count",
      label: "失败次数偏高",
      severity: "medium",
      score: 18,
      detail: "近期失败任务数量偏高，建议客服和工程联动检查。",
      evidence: [{ label: "failed", value: stats.failedGenerations }],
    });
  }
  if (stats.refundCredits >= 100) {
    signals.push({
      key: "refund_high",
      label: "退款补偿偏高",
      severity: "high",
      score: 30,
      detail: "近期退款或补偿灵点偏高，需核对是否存在重复补偿或批量失败。",
      evidence: [{ label: "refundCredits", value: stats.refundCredits }],
    });
  } else if (stats.refundCredits >= 30) {
    signals.push({
      key: "refund_medium",
      label: "退款补偿增加",
      severity: "medium",
      score: 15,
      detail: "近期存在较多退款或补偿，建议保留客服上下文。",
      evidence: [{ label: "refundCredits", value: stats.refundCredits }],
    });
  }
  if (stats.adjustmentCredits >= 50) {
    signals.push({
      key: "manual_adjustment",
      label: "人工调整偏多",
      severity: "medium",
      score: 15,
      detail: "近期人工调整灵点较多，应核对审批和客服记录。",
      evidence: [{ label: "adjustmentCredits", value: stats.adjustmentCredits }],
    });
  }
  if (stats.urgentSupportTickets > 0) {
    signals.push({
      key: "urgent_support",
      label: "紧急工单",
      severity: "high",
      score: 25,
      detail: "存在未完结紧急客服工单，建议先处理用户承诺和风险动作。",
      evidence: [{ label: "urgent", value: stats.urgentSupportTickets }],
    });
  } else if (stats.supportTickets >= 3) {
    signals.push({
      key: "support_backlog",
      label: "工单积压",
      severity: "medium",
      score: 10,
      detail: "未完结工单较多，可能影响后续补偿和账户处理判断。",
      evidence: [{ label: "openTickets", value: stats.supportTickets }],
    });
  }
  if (stats.generationCount >= 40) {
    signals.push({
      key: "burst_usage",
      label: "短期高频生成",
      severity: "medium",
      score: 12,
      detail: "近期生成频次偏高，建议观察是否为批量任务或异常脚本行为。",
      evidence: [{ label: "generationCount", value: stats.generationCount }],
    });
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.score, 0));
  const level = score >= 80 ? "critical" : score >= 55 ? "high" : score >= 25 ? "medium" : "low";

  return {
    userId: profile.id,
    email: profile.email || null,
    displayName: profile.displayName,
    credits: profile.credits,
    totalCreditsUsed: profile.totalCreditsUsed,
    generationCount: stats.generationCount,
    failedGenerations: stats.failedGenerations,
    refundCredits: stats.refundCredits,
    adjustmentCredits: stats.adjustmentCredits,
    moderationHits: stats.moderationHits,
    supportTickets: stats.supportTickets,
    urgentSupportTickets: stats.urgentSupportTickets,
    latestActivityAt: latestDate(stats.latestActivityAt, profile.updatedAt || profile.createdAt),
    score,
    level,
    signals,
    recommendedAction: riskRecommendedAction(level),
    detailUrl: `/admin/users/${profile.id}`,
  };
}

function createRiskMetrics(rows: AdminRiskUserItem[]): AdminRiskOverview["metrics"] {
  const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
  return {
    sampledUsers: rows.length,
    criticalUsers: rows.filter((row) => row.level === "critical").length,
    highUsers: rows.filter((row) => row.level === "high").length,
    mediumUsers: rows.filter((row) => row.level === "medium").length,
    failedGenerations: rows.reduce((sum, row) => sum + row.failedGenerations, 0),
    refundCredits: rows.reduce((sum, row) => sum + row.refundCredits, 0),
    moderationHits: rows.reduce((sum, row) => sum + row.moderationHits, 0),
    urgentSupportTickets: rows.reduce((sum, row) => sum + row.urgentSupportTickets, 0),
    averageScore: rows.length ? Math.round(totalScore / rows.length) : 0,
  };
}

function matchesRiskSearch(row: AdminRiskUserItem, q: string) {
  return [
    row.userId,
    row.email || "",
    row.displayName || "",
    row.level,
    row.recommendedAction,
    row.signals.map((signal) => signal.label).join(" "),
  ].some((value) => value.toLowerCase().includes(q));
}

function normalizeRiskLevel(value: unknown): AdminRiskLevel | "" {
  const normalized = stringValue(value).toLowerCase();
  return normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical"
    ? normalized
    : "";
}

function clampRiskDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(7, Math.floor(parsed)));
}

function latestDate(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b || null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function riskRecommendedAction(level: AdminRiskLevel) {
  if (level === "critical") return "立即人工复核，必要时限制公开展示和大额补偿。";
  if (level === "high") return "进入风控复核队列，先核对任务、灵点、审核和客服记录。";
  if (level === "medium") return "观察并保留上下文，后续补偿或下架前复核。";
  return "低风险，保持正常观察。";
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
  const [generationStats, workflowStats, controls] = await Promise.all([
    loadUserGenerationStats(userIds, warnings),
    loadUserWorkflowStats(userIds, warnings),
    loadUserControlMap(userIds, warnings),
  ]);

  return {
    rows: profiles.map((row) => {
      const profile = mapProfileRow(row);
      const generation = generationStats.get(profile.id) || { count: 0, latestAt: null };
      return applyUserControl({
        ...profile,
        generationCount: generation.count,
        workflowCount: workflowStats.get(profile.id) || 0,
        latestGenerationAt: generation.latestAt,
      }, controls.get(profile.id));
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
    accountStatus: "active",
    generateEnabled: true,
    supportLevel: "standard",
    controlReason: null,
    controlNote: null,
    controlExpiresAt: null,
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
  stale?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
} = {}): Promise<AdminTaskList> {
  const admin = getAdminClient();
  const warnings: string[] = [];
  const page = clampLimit(args.page, 1, 10_000, 1);
  const pageSize = clampLimit(args.pageSize ?? args.limit, 10, 200, 40);
  const offset = (page - 1) * pageSize;
  const status = normalizeStatusFilter(args.status);
  const module = normalizeModuleFilter(args.module);
  const sourceType = args.sourceType && args.sourceType !== "all" ? args.sourceType : "";
  const q = (args.q || "").trim().toLowerCase();
  const needsClientFilter = Boolean(q || args.stale);
  const clientFilterLimit = Math.min(1000, Math.max(page * pageSize * (q ? 3 : 2), pageSize));

  let query = admin
    .from("task_queue_items")
    .select(TASK_QUEUE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status_group", status);
  if (module) query = query.eq("module", module);
  if (sourceType) query = query.eq("source_type", sourceType);
  query = needsClientFilter ? query.limit(clientFilterLimit) : query.range(offset, offset + pageSize - 1);

  const indexed = await runQuery<Record<string, unknown>[]>(query, "task queue list", warnings, true);
  if (indexed.data) {
    let rows = await hydrateTaskPreviewThumbnails(indexed.data.map(mapTaskQueueRow), warnings);
    if (q) rows = rows.filter((row) => matchesTaskSearch(row, q));
    if (args.stale) rows = rows.filter((row) => row.isStale);
    return {
      rows: needsClientFilter ? rows.slice(offset, offset + pageSize) : rows,
      total: needsClientFilter ? rows.length : indexed.count ?? rows.length,
      source: "task_queue_items",
      warnings: uniqueStrings(warnings),
    };
  }

  const fallback = await loadFallbackTasks({ page, pageSize, status, module, sourceType, q, stale: Boolean(args.stale) }, warnings);
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
    rows: result.data.map(mapAuditRow),
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

export async function listAdminBillingOverview(): Promise<AdminBillingOverview> {
  const warnings: string[] = [];
  const admin = getAdminClient();

  const [
    productsResult,
    pricesResult,
    ordersResult,
    subscriptionsResult,
    webhookEventsResult,
  ] = await Promise.all([
    runQuery<Record<string, unknown>[]>(
      admin.from(BILLING_PRODUCTS_TABLE).select("*", { count: "exact" }).limit(100),
      "billing products",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin.from(BILLING_PRICES_TABLE).select("*", { count: "exact" }).limit(120),
      "billing prices",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin.from(BILLING_ORDERS_TABLE).select("*", { count: "exact" }).limit(120),
      "billing orders",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin.from(BILLING_SUBSCRIPTIONS_TABLE).select("*", { count: "exact" }).limit(120),
      "billing subscriptions",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin.from(BILLING_WEBHOOK_EVENTS_TABLE).select("*", { count: "exact" }).limit(120),
      "billing webhook events",
      warnings,
      true,
    ),
  ]);

  const products = (productsResult.data || [])
    .map(mapBillingProduct)
    .sort((a, b) => compareDateDesc(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt));
  const productNames = new Map(products.map((product) => [product.stripeProductId, product.name]));
  const prices = (pricesResult.data || [])
    .map((row) => mapBillingPrice(row, productNames))
    .sort((a, b) => compareDateDesc(a.createdAt, b.createdAt));

  const orderEmails = await loadProfileEmails(
    (ordersResult.data || []).map((row) => pickString(row, ["user_id", "userId"])),
    warnings,
  );
  const subscriptionEmails = await loadProfileEmails(
    (subscriptionsResult.data || []).map((row) => pickString(row, ["user_id", "userId"])),
    warnings,
  );
  const orders = (ordersResult.data || [])
    .map((row) => mapBillingOrder(row, orderEmails))
    .sort((a, b) => compareDateDesc(a.createdAt, b.createdAt));
  const subscriptions = (subscriptionsResult.data || [])
    .map((row) => mapBillingSubscription(row, subscriptionEmails))
    .sort((a, b) => compareDateDesc(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt));
  const webhookEvents = (webhookEventsResult.data || [])
    .map(mapBillingWebhookEvent)
    .sort((a, b) => compareDateDesc(a.createdAt, b.createdAt));

  const tableStatuses = [
    billingTableStatus(BILLING_PRODUCTS_TABLE, "Products table", productsResult),
    billingTableStatus(BILLING_PRICES_TABLE, "Prices table", pricesResult),
    billingTableStatus(BILLING_ORDERS_TABLE, "Orders table", ordersResult),
    billingTableStatus(BILLING_SUBSCRIPTIONS_TABLE, "Subscriptions table", subscriptionsResult),
    billingTableStatus(BILLING_WEBHOOK_EVENTS_TABLE, "Webhook events table", webhookEventsResult),
  ];
  const configStatus = [
    billingEnvStatus("STRIPE_SECRET_KEY", "Stripe secret key", process.env.STRIPE_SECRET_KEY),
    billingEnvStatus(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "Stripe publishable key",
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
    ),
    billingEnvStatus("STRIPE_WEBHOOK_SECRET", "Stripe webhook secret", process.env.STRIPE_WEBHOOK_SECRET),
    ...tableStatuses,
  ];
  const available = tableStatuses.some((item) => item.configured);
  const missingConfigCount = configStatus.filter((item) => !item.configured).length;
  const activeSubscriptions = subscriptions.filter((row) => row.status === "active" || row.status === "trialing").length;
  const failedWebhookEvents = webhookEvents.filter((row) => {
    const status = row.status.toLowerCase();
    return status === "failed" || status === "error" || status === "retrying";
  }).length;
  const revenue = orders
    .filter((row) => ["paid", "succeeded", "complete", "completed"].includes(row.status.toLowerCase()))
    .reduce((sum, row) => sum + Math.max(0, row.amountTotal - row.refundedAmount), 0);

  return {
    available,
    metrics: [
      { label: "Active products", value: products.filter((row) => row.active).length, hint: `${products.length} loaded`, tone: "neutral" },
      { label: "Active prices", value: prices.filter((row) => row.active).length, hint: `${prices.length} loaded`, tone: "neutral" },
      { label: "Sample revenue", value: toMajorCurrency(revenue), hint: "paid orders minus refunds", tone: revenue > 0 ? "good" : "neutral" },
      { label: "Active subscriptions", value: activeSubscriptions, hint: `${subscriptions.length} loaded`, tone: activeSubscriptions > 0 ? "good" : "neutral" },
      { label: "Webhook issues", value: failedWebhookEvents, hint: `${webhookEvents.length} events sampled`, tone: failedWebhookEvents > 0 ? "warning" : "good" },
      { label: "Missing config", value: missingConfigCount, hint: "env vars and billing tables", tone: missingConfigCount > 0 ? "warning" : "good" },
    ],
    products,
    prices,
    orders,
    subscriptions,
    webhookEvents,
    configStatus,
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
  const visibleRows = rows.slice(0, limit);
  const moderationMap = await loadLatestModerationForAssets(visibleRows, warnings);

  return {
    rows: visibleRows.map((row) => ({
      ...row,
      moderationCase: moderationMap.get(assetModerationKey(row.sourceType, row.id)) || null,
    })),
    total: generationResult.count ?? rows.length,
    warnings: uniqueStrings(warnings),
  };
}

export async function getAdminAssetLifecycleOverview(args: {
  q?: string;
  module?: string;
  limit?: number;
} = {}): Promise<AdminAssetLifecycleOverview> {
  const limit = clampLimit(args.limit, 20, 160, 100);
  const assets = await listAdminAssets({ q: args.q, module: args.module, limit });
  const rows = assets.rows.map(mapAssetLifecycleItem);

  return {
    generatedAt: new Date().toISOString(),
    rows,
    policies: ASSET_LIFECYCLE_POLICIES,
    metrics: rows.reduce((metrics, row) => {
      metrics.sampledAssets += 1;
      metrics.sampledUrls += row.urlCount + row.inputCount;
      if (row.providers.includes("aliyun-oss")) metrics.ossUrls += countProviderUrls(row, "aliyun-oss");
      if (row.providers.includes("imgbb")) metrics.imgbbUrls += countProviderUrls(row, "imgbb");
      if (row.providers.includes("external")) metrics.externalUrls += countProviderUrls(row, "external");
      if (row.providers.includes("data-url")) metrics.dataUrls += countProviderUrls(row, "data-url");
      if (row.providers.includes("unknown")) metrics.unknownUrls += countProviderUrls(row, "unknown");
      if (row.stage === "migrate") metrics.migrationCandidates += 1;
      if (row.stage === "archive") metrics.archiveCandidates += 1;
      if (row.stage === "protected") metrics.protectedAssets += 1;
      if (row.stage === "review") metrics.reviewCandidates += 1;
      if (row.moderationAction === "hide") metrics.hiddenAssets += 1;
      return metrics;
    }, createAssetLifecycleMetrics()),
    warnings: assets.warnings,
  };
}

export async function listAdminModerationCases(args: { q?: string; limit?: number } = {}): Promise<AdminModerationList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 120, 60);
  const q = (args.q || "").trim().toLowerCase();
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("moderation_cases")
      .select(MODERATION_CASE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(q ? Math.min(limit * 4, 300) : limit),
    "moderation cases",
    warnings,
    true,
  );

  if (!result.data) {
    return { rows: [], available: false, warnings: uniqueStrings(warnings) };
  }

  let rows = result.data.map(mapModerationCase);
  if (q) rows = rows.filter((row) => matchesModerationSearch(row, q));

  return {
    rows: rows.slice(0, limit),
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminOperationRequests(args: {
  q?: string;
  status?: string;
  limit?: number;
} = {}): Promise<AdminOperationRequestList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 120, 60);
  const q = (args.q || "").trim().toLowerCase();
  const status = normalizeOperationRequestStatus(args.status);
  let query = getAdminClient()
    .from("admin_operation_requests")
    .select(OPERATION_REQUEST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(q ? Math.min(limit * 4, 300) : limit);
  if (status) query = query.eq("status", status);

  const result = await runQuery<Record<string, unknown>[]>(
    query,
    "operation requests",
    warnings,
    true,
  );

  if (!result.data) {
    return { rows: [], available: false, warnings: uniqueStrings(warnings) };
  }

  let rows = result.data.map(mapOperationRequest);
  if (q) rows = rows.filter((row) => matchesOperationRequestSearch(row, q));

  return {
    rows: rows.slice(0, limit),
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminSupportTickets(args: {
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  limit?: number;
} = {}): Promise<AdminSupportTicketList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 160, 80);
  const q = (args.q || "").trim().toLowerCase();
  const status = normalizeSupportTicketStatus(args.status);
  const priority = normalizeSupportTicketPriority(args.priority);
  const category = normalizeSupportTicketCategory(args.category);
  let query = getAdminClient()
    .from("admin_support_tickets")
    .select(SUPPORT_TICKET_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(q ? Math.min(limit * 4, 400) : limit);

  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (category) query = query.eq("category", category);

  const result = await runQuery<Record<string, unknown>[]>(
    query,
    "support tickets",
    warnings,
    true,
  );

  if (!result.data) {
    return {
      rows: [],
      available: false,
      total: 0,
      metrics: createSupportTicketMetrics([]),
      warnings: uniqueStrings(warnings),
    };
  }

  let rows = result.data.map(mapSupportTicket);
  if (q) rows = rows.filter((row) => matchesSupportTicketSearch(row, q));
  const visibleRows = rows.slice(0, limit);

  return {
    rows: visibleRows,
    available: true,
    total: result.count ?? rows.length,
    metrics: createSupportTicketMetrics(visibleRows),
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminSavedViews(args: { resource?: string; limit?: number } = {}): Promise<AdminSavedViewList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 120, 60);
  const resource = (args.resource || "").trim();
  let query = getAdminClient()
    .from("admin_saved_views")
    .select(SAVED_VIEW_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (resource) query = query.eq("resource", resource);

  const result = await runQuery<Record<string, unknown>[]>(
    query,
    "saved views",
    warnings,
    true,
  );

  if (!result.data) {
    return { rows: [], available: false, warnings: uniqueStrings(warnings) };
  }

  return {
    rows: result.data.map(mapSavedView),
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

export async function listAdminExportJobs(args: { limit?: number } = {}): Promise<AdminExportJobList> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 120, 60);
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_export_jobs")
      .select(EXPORT_JOB_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit),
    "export jobs",
    warnings,
    true,
  );

  if (!result.data) {
    return { rows: [], available: false, warnings: uniqueStrings(warnings) };
  }

  return {
    rows: result.data.map(mapExportJob),
    available: true,
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

export async function getAdminPromptExperimentOverview(): Promise<AdminPromptExperimentOverview> {
  const warnings: string[] = [];
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_config_versions")
      .select(ADMIN_CONFIG_COLUMNS)
      .eq("config_key", PROMPT_EXPERIMENT_CONFIG_KEY)
      .order("created_at", { ascending: false })
      .limit(80),
    "prompt experiment config versions",
    warnings,
    true,
  );

  if (!result.data) {
    return {
      available: false,
      configKey: PROMPT_EXPERIMENT_CONFIG_KEY,
      activeVersion: null,
      draftVersions: [],
      archivedVersions: [],
      experiments: [],
      metrics: emptyPromptExperimentMetrics(),
      warnings: uniqueStrings([
        ...warnings,
        result.error
          ? `admin_config_versions: ${result.error}`
          : "admin_config_versions table is not ready. Run supabase/admin-console.sql first.",
      ]),
      exampleValue: DEFAULT_PROMPT_EXPERIMENT_CONFIG,
    };
  }

  const versions = result.data.map(mapConfigVersion);
  const activeVersion = versions.find((item) => item.status === "published") || null;
  const sourceVersions = activeVersion ? [activeVersion] : versions.filter((item) => item.status !== "archived").slice(0, 1);
  const experiments = sourceVersions.flatMap((version) => parsePromptExperiments(version, warnings));
  const coveredModules = new Set(experiments.map((item) => item.module).filter(Boolean));
  const totalTraffic = experiments.reduce((sum, item) => sum + item.traffic, 0);

  return {
    available: true,
    configKey: PROMPT_EXPERIMENT_CONFIG_KEY,
    activeVersion,
    draftVersions: versions.filter((item) => item.status === "draft"),
    archivedVersions: versions.filter((item) => item.status === "archived"),
    experiments,
    metrics: {
      total: experiments.length,
      running: experiments.filter((item) => item.status === "running").length,
      draft: experiments.filter((item) => item.status === "draft").length,
      paused: experiments.filter((item) => item.status === "paused").length,
      completed: experiments.filter((item) => item.status === "completed").length,
      coveredModules: coveredModules.size,
      variants: experiments.reduce((sum, item) => sum + item.variants.length, 0),
      averageTraffic: experiments.length ? Math.round(totalTraffic / experiments.length) : 0,
    },
    warnings: uniqueStrings(warnings),
    exampleValue: DEFAULT_PROMPT_EXPERIMENT_CONFIG,
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

  const baseProfile = profileRows[0] ? mapProfileRow(profileRows[0]) : null;
  const [creditLogs, tasks, assets, controls] = await Promise.all([
    listAdminCreditLogs({ q: userId, limit: 30 }),
    loadUserTasks(userId, warnings),
    loadUserAssets(userId, warnings),
    loadUserControlMap([userId], warnings),
  ]);
  const profile = baseProfile ? applyUserControl(baseProfile, controls.get(userId)) : null;

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

export async function getAdminWorkerOverview(): Promise<AdminWorkerOverview> {
  const warnings: string[] = [];
  const staleMinutes = clampLimit(process.env.GENERATION_JOB_STALE_MINUTES, 5, 180, 20);
  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("task_queue_items")
      .select(TASK_QUEUE_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(300),
    "worker task queue sample",
    warnings,
    true,
  );

  let rows = (result.data || []).map(mapTaskQueueRow);
  if (!result.data) {
    const fallback = await listAdminTasks({ limit: 120 });
    rows = fallback.rows;
    warnings.push(...fallback.warnings);
  }

  const queue = {
    sampled: rows.length,
    queued: rows.filter((row) => row.statusGroup === "queued").length,
    running: rows.filter((row) => row.statusGroup === "running").length,
    completed: rows.filter((row) => row.statusGroup === "completed").length,
    failed: rows.filter((row) => row.statusGroup === "failed").length,
    stale: 0,
    staleMinutes,
  };
  const staleTasks = rows
    .filter((row) => row.statusGroup === "running" && isTaskStale(row, staleMinutes))
    .slice(0, 30);
  queue.stale = staleTasks.length;

  const auditResult = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_audit_logs")
      .select("id,actor_user_id,actor_email,actor_role,action,resource_type,resource_id,reason,metadata,created_at")
      .like("action", "worker.run%")
      .order("created_at", { ascending: false })
      .limit(20),
    "worker audit runs",
    warnings,
    true,
  );

  return {
    processors: getWorkerProcessors(),
    queue,
    staleTasks,
    recentRuns: (auditResult.data || []).map(mapAuditRow),
    warnings: uniqueStrings(warnings),
  };
}

export async function getAdminAgentEvalOverview(args: { q?: string; limit?: number } = {}): Promise<AdminAgentEvalOverview> {
  const warnings: string[] = [];
  const limit = clampLimit(args.limit, 10, 120, 50);
  const q = (args.q || "").trim().toLowerCase();
  const generatedAt = new Date().toISOString();
  const processor = getWorkerProcessors().find((item) => item.key === "agent-evals") || getWorkerProcessors()[2];
  const admin = getAdminClient();
  const [runsResult, failuresResult] = await Promise.all([
    runQuery<Record<string, unknown>[]>(
      admin
        .from("agent_eval_runs")
        .select(AGENT_EVAL_RUN_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(q ? Math.min(limit * 4, 300) : limit),
      "agent eval runs",
      warnings,
      true,
    ),
    runQuery<Record<string, unknown>[]>(
      admin
        .from("agent_eval_results")
        .select(AGENT_EVAL_RESULT_COLUMNS)
        .eq("ok", false)
        .order("created_at", { ascending: false })
        .limit(q ? Math.min(limit * 4, 300) : 80),
      "agent eval failed results",
      warnings,
      true,
    ),
  ]);

  if (!runsResult.data) {
    return {
      available: false,
      generatedAt,
      processor,
      metrics: emptyAgentEvalMetrics(),
      runs: [],
      failures: [],
      baselineCases: BRAIN_EVAL_CASES.map(mapBrainEvalCase),
      warnings: uniqueStrings([
        ...warnings,
        runsResult.error
          ? `agent_eval_runs: ${runsResult.error}`
          : "agent_eval_runs table is not ready. Run supabase/agent-brain-traces.sql first.",
      ]),
    };
  }

  if (failuresResult.error) {
    warnings.push(`agent_eval_results: ${failuresResult.error}`);
  }

  const userIds = uniqueStrings([
    ...runsResult.data.map((row) => stringValue(row.user_id)),
    ...((failuresResult.data || []).map((row) => stringValue(row.user_id))),
  ]);
  const emails = await loadProfileEmails(userIds, warnings);
  let runs = runsResult.data.map((row) => mapAgentEvalRun(row, emails));
  let failures = (failuresResult.data || []).map((row) => mapAgentEvalResult(row, emails));

  if (q) {
    runs = runs.filter((row) => matchesAgentEvalRunSearch(row, q));
    failures = failures.filter((row) => matchesAgentEvalResultSearch(row, q));
  }

  runs = runs.slice(0, limit);
  failures = failures.slice(0, Math.min(limit, 80));
  const totalCases = runs.reduce((sum, row) => sum + row.total, 0);
  const passedCases = runs.reduce((sum, row) => sum + row.passed, 0);
  const latencySamples = runs.filter((row) => row.latencyMs > 0);
  const avgScore = runs.length ? Math.round(runs.reduce((sum, row) => sum + row.score, 0) / runs.length) : 0;
  const averageLatencyMs = latencySamples.length
    ? Math.round(latencySamples.reduce((sum, row) => sum + row.latencyMs, 0) / latencySamples.length)
    : 0;

  return {
    available: true,
    generatedAt,
    processor,
    metrics: {
      totalRuns: q ? runs.length : runsResult.count ?? runs.length,
      recentRuns: runs.length,
      avgScore,
      passRate: totalCases ? Math.round((passedCases / totalCases) * 100) : 0,
      failedRuns: runs.filter((row) => row.failed > 0 || row.total === 0).length,
      failedCases: failures.length,
      uniqueUsers: new Set(runs.map((row) => row.userId).filter(Boolean)).size,
      averageLatencyMs,
      latestRunAt: runs[0]?.createdAt || null,
    },
    runs,
    failures,
    baselineCases: BRAIN_EVAL_CASES.map(mapBrainEvalCase),
    warnings: uniqueStrings(warnings),
  };
}

function getAdminNanoBananaProviderLabel(provider: NanoBananaProviderName) {
  if (provider === "catrouter") return "CatRouter";
  if (provider === "laozhang") return "LaoZhang";
  return "Yunwu";
}

function getAdminGptImageProviderLabel(provider: GptImageProviderName) {
  return provider === "catrouter" ? "CatRouter" : "Plato";
}

export async function getAdminProviderCatalog(): Promise<AdminProviderCatalog> {
  const routing = await getActiveModelRoutingConfig();
  const nanoBananaProvider = getAdminNanoBananaProviderLabel(routing.nanoBananaProvider);
  const gptImageProvider = getAdminGptImageProviderLabel(routing.gptImageProvider);
  const nanoBananaConfigured = routing.nanoBananaProvider === "catrouter"
    ? Boolean(process.env.CATROUTER_API_KEY?.trim())
    : routing.nanoBananaProvider === "laozhang"
      ? Boolean(process.env.LAOZHANG_API_KEY?.trim())
      : Boolean(process.env.YUNWU_NATIVE_API_KEY?.trim() || process.env.YUNWU_API_KEY?.trim());
  const gptImageConfigured = routing.gptImageProvider === "catrouter"
    ? Boolean(process.env.CATROUTER_API_KEY?.trim())
    : Boolean(process.env.PLATO_API_KEY?.trim() || process.env.LINGYA_API_KEY?.trim());
  const nanoBananaEnvKeys = routing.nanoBananaProvider === "catrouter"
    ? ["NANO_BANANA_PROVIDER", "CATROUTER_API_KEY", "CATROUTER_BASE_URL", "CATROUTER_NANO_BANANA_MODEL"]
    : routing.nanoBananaProvider === "laozhang"
      ? ["NANO_BANANA_PROVIDER", "LAOZHANG_API_KEY", "LAOZHANG_BASE_URL", "LAOZHANG_NANO_BANANA_MODEL"]
      : ["NANO_BANANA_PROVIDER", "YUNWU_NATIVE_API_KEY", "YUNWU_NATIVE_BASE_URL", "YUNWU_NANO_BANANA_MODEL"];
  const nanoBananaProEnvKeys = routing.nanoBananaProvider === "catrouter"
    ? ["NANO_BANANA_PROVIDER", "CATROUTER_API_KEY", "CATROUTER_BASE_URL", "CATROUTER_NANO_BANANA_PRO_MODEL"]
    : routing.nanoBananaProvider === "laozhang"
      ? ["NANO_BANANA_PROVIDER", "LAOZHANG_API_KEY", "LAOZHANG_BASE_URL", "LAOZHANG_NANO_BANANA_PRO_MODEL"]
      : ["NANO_BANANA_PROVIDER", "YUNWU_NATIVE_API_KEY", "YUNWU_NATIVE_BASE_URL", "YUNWU_NANO_BANANA_PRO_MODEL"];
  const gptImageEnvKeys = routing.gptImageProvider === "catrouter"
    ? ["GPT_IMAGE_PROVIDER", "CATROUTER_API_KEY", "CATROUTER_BASE_URL", "CATROUTER_GPT_IMAGE_MODEL"]
    : ["GPT_IMAGE_PROVIDER", "PLATO_API_KEY", "PLATO_BASE_URL", "PLATO_GPT_IMAGE_MODEL"];

  return {
    defaultModel: DEFAULT_LINGYA_MODEL,
    routing: {
      source: routing.source,
      configKey: routing.configKey,
      versionId: routing.versionId,
      publishedAt: routing.publishedAt,
      gptImageProvider: routing.gptImageProvider,
      nanoBananaProvider: routing.nanoBananaProvider,
    },
    models: [
      {
        model: "nano-banana-2",
        provider: nanoBananaProvider,
        endpointKind: "Gemini native image",
        configured: nanoBananaConfigured,
        envKeys: nanoBananaEnvKeys,
        costs: CREDIT_COSTS["nano-banana-2"],
        notes: "默认低成本主力模型，适合批量生产和姿势裂变。",
      },
      {
        model: "nano-banana-pro",
        provider: nanoBananaProvider,
        endpointKind: "Gemini native image",
        configured: nanoBananaConfigured,
        envKeys: nanoBananaProEnvKeys,
        costs: CREDIT_COSTS["nano-banana-pro"],
        notes: "高质量模型，适合品牌大片和复杂参考图。",
      },
      {
        model: "gpt-image-2",
        provider: gptImageProvider,
        endpointKind: "OpenAI-compatible image",
        configured: gptImageConfigured,
        envKeys: gptImageEnvKeys,
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

const ASSET_LIFECYCLE_POLICIES: AdminAssetLifecyclePolicy[] = [
  {
    id: "favorite-protection",
    title: "收藏与参考素材保留",
    description: "用户收藏方案、参考图和可复用素材默认进入保护池，迁移和删除前必须先确认引用影响。",
    stage: "protected",
    action: "retain",
    threshold: "reference/favorite-plan",
  },
  {
    id: "external-storage-migration",
    title: "外部 URL 迁移到 OSS",
    description: "ImgBB、第三方域名和未知来源 URL 进入迁移候选，优先复制到当前 OSS 前缀并回写引用。",
    stage: "migrate",
    action: "migrate_to_oss",
    threshold: "provider != aliyun-oss",
  },
  {
    id: "temporary-input-review",
    title: "临时输入图复核",
    description: "超过 30 天仍被任务引用的输入图进入复核池，确认是否需要长期保留或转入归档前缀。",
    stage: "review",
    action: "review_temp_inputs",
    threshold: "input age > 30d",
  },
  {
    id: "generated-result-archive",
    title: "历史生成结果归档",
    description: "超过 180 天的非收藏生成结果进入归档候选，后续由异步 worker 做软归档或冷存储迁移。",
    stage: "archive",
    action: "archive_generated_result",
    threshold: "generation age > 180d",
  },
  {
    id: "moderation-freeze",
    title: "审核下架冻结",
    description: "审核标记为下架的素材优先冻结展示，并阻止再次进入用户作品库或公开分享链路。",
    stage: "archive",
    action: "freeze_and_hide",
    threshold: "moderation = hide",
  },
];

function mapAssetLifecycleItem(row: AdminAssetListItem): AdminAssetLifecycleItem {
  const allUrls = uniqueStrings([...row.urls, ...row.inputUrls]);
  const providers = uniqueStrings(allUrls.map(classifyAssetUrl)) as AdminAssetStorageProvider[];
  const ageDays = getAssetAgeDays(row.updatedAt || row.createdAt);
  const moderationAction = row.moderationCase?.action || null;
  const reasons: string[] = [];
  let stage: AdminAssetLifecycleStage = "retained";
  let riskLevel: AdminAssetLifecycleItem["riskLevel"] = "low";
  let recommendedAction: AdminAssetLifecycleAction = "retain";

  if (row.sourceType === "reference" || row.sourceType === "favorite-plan") {
    stage = "protected";
    reasons.push("用户参考图或收藏方案仍有业务引用，默认保护。");
  }

  if (providers.some((provider) => provider !== "aliyun-oss" && provider !== "data-url")) {
    stage = "migrate";
    riskLevel = "medium";
    recommendedAction = "migrate_to_oss";
    reasons.push("存在 ImgBB、第三方或未知来源 URL，建议迁移到 OSS。");
  }

  if (row.inputUrls.length > 0 && ageDays > 30 && stage !== "migrate") {
    stage = "review";
    riskLevel = "medium";
    recommendedAction = "review_temp_inputs";
    reasons.push("输入图超过 30 天仍被引用，需要确认长期保留策略。");
  }

  if (row.sourceType === "generation" && ageDays > 180 && stage !== "migrate" && stage !== "review") {
    stage = "archive";
    riskLevel = "medium";
    recommendedAction = "archive_generated_result";
    reasons.push("生成结果超过 180 天，可进入归档候选。");
  }

  if (moderationAction === "hide") {
    stage = "archive";
    riskLevel = "high";
    recommendedAction = "freeze_and_hide";
    reasons.push("审核已标记下架，应优先冻结展示。");
  }

  if (!reasons.length) {
    reasons.push("当前 URL 来源和引用状态正常，继续保留。");
  }

  return {
    ...row,
    providers: providers.length ? providers : ["unknown"],
    urlCount: row.urls.length,
    inputCount: row.inputUrls.length,
    ageDays,
    stage,
    riskLevel,
    reasons,
    recommendedAction,
    moderationAction,
  };
}

function createAssetLifecycleMetrics(): AdminAssetLifecycleOverview["metrics"] {
  return {
    sampledAssets: 0,
    sampledUrls: 0,
    ossUrls: 0,
    imgbbUrls: 0,
    externalUrls: 0,
    dataUrls: 0,
    unknownUrls: 0,
    migrationCandidates: 0,
    archiveCandidates: 0,
    protectedAssets: 0,
    reviewCandidates: 0,
    hiddenAssets: 0,
  };
}

function countProviderUrls(row: AdminAssetLifecycleItem, provider: AdminAssetStorageProvider) {
  return [...row.urls, ...row.inputUrls].filter((url) => classifyAssetUrl(url) === provider).length;
}

function classifyAssetUrl(url: string): AdminAssetStorageProvider {
  if (!url) return "unknown";
  if (url.startsWith("data:image/")) return "data-url";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const configuredHost = getConfiguredOssHost();
    if (
      host.includes("aliyuncs.com") ||
      host.includes("oss-") ||
      (configuredHost && host === configuredHost)
    ) {
      return "aliyun-oss";
    }
    if (host.includes("ibb.co") || host.includes("imgbb.com")) return "imgbb";
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return "external";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function getConfiguredOssHost() {
  const candidates = [
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL,
    process.env.ALIYUN_OSS_ENDPOINT,
    process.env.ALIYUN_OSS_BUCKET,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return new URL(String(candidate)).hostname.toLowerCase();
    } catch {
      const normalized = String(candidate).trim().toLowerCase();
      if (normalized.includes(".")) return normalized;
    }
  }
  return "";
}

function getAssetAgeDays(value: string | null | undefined) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

async function loadLatestModerationForAssets(rows: AdminAssetListItem[], warnings: string[]) {
  const ids = uniqueStrings(rows.map((row) => row.id));
  const map = new Map<string, AdminModerationCase>();
  if (!ids.length) return map;

  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("moderation_cases")
      .select(MODERATION_CASE_COLUMNS)
      .in("source_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.min(ids.length * 3, 500)),
    "asset moderation cases",
    warnings,
    true,
  );

  for (const row of result.data || []) {
    const item = mapModerationCase(row);
    const key = assetModerationKey(item.sourceType, item.sourceId);
    if (!map.has(key)) map.set(key, item);
  }

  return map;
}

function assetModerationKey(sourceType: string, id: string) {
  return `${sourceType}:${id}`;
}

function matchesModerationSearch(row: AdminModerationCase, q: string) {
  return [
    row.id,
    row.sourceType,
    row.sourceId,
    row.action,
    row.status,
    row.reason || "",
  ].some((value) => value.toLowerCase().includes(q));
}

function matchesOperationRequestSearch(row: AdminOperationRequest, q: string) {
  return [
    row.id,
    row.requestType,
    row.status,
    row.targetType,
    row.targetId,
    row.reason,
    row.requestedByEmail || "",
    row.requestedBy || "",
    JSON.stringify(row.payload),
  ].some((value) => value.toLowerCase().includes(q));
}

function normalizeOperationRequestStatus(value?: string) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected" ||
    normalized === "cancelled" ||
    normalized === "failed"
    ? normalized
    : "";
}

export function normalizeSupportTicketStatus(value: unknown): AdminSupportTicketStatus | "" {
  const normalized = stringValue(value).toLowerCase();
  return normalized === "open" ||
    normalized === "pending" ||
    normalized === "waiting_user" ||
    normalized === "resolved" ||
    normalized === "closed"
    ? normalized
    : "";
}

export function normalizeSupportTicketPriority(value: unknown): AdminSupportTicketPriority | "" {
  const normalized = stringValue(value).toLowerCase();
  return normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "urgent"
    ? normalized
    : "";
}

export function normalizeSupportTicketCategory(value: unknown): AdminSupportTicketCategory | "" {
  const normalized = stringValue(value).toLowerCase();
  return normalized === "generation_failure" ||
    normalized === "credit_issue" ||
    normalized === "content_moderation" ||
    normalized === "billing" ||
    normalized === "account" ||
    normalized === "technical" ||
    normalized === "other"
    ? normalized
    : "";
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
    { key: "HAPPYHORSE_API_KEY", label: "HappyHorse Video API", configured: Boolean(process.env.HAPPYHORSE_API_KEY || process.env.YUNWU_HAPPYHORSE_API_KEY || process.env.YUNWU_API_KEY), scope: "provider" },
    { key: "PLATO_API_KEY", label: "Plato API", configured: Boolean(process.env.PLATO_API_KEY), scope: "provider" },
    { key: "LINGYA_API_KEY", label: "Lingya API", configured: Boolean(process.env.LINGYA_API_KEY), scope: "provider" },
  ];
}

function getWorkerProcessors(): AdminWorkerProcessor[] {
  return [
    workerProcessor({
      key: "generations",
      label: "生成任务处理",
      endpoint: "/api/jobs/process-generations",
      batchSize: clampLimit(process.env.GENERATION_JOB_BATCH_SIZE, 1, 10, 2),
      candidates: [
        { name: "JOB_PROCESSOR_SECRET", value: process.env.JOB_PROCESSOR_SECRET },
        { name: "CRON_SECRET", value: process.env.CRON_SECRET },
      ],
    }),
    workerProcessor({
      key: "agent-workflows",
      label: "工作流助手处理",
      endpoint: "/api/jobs/process-agent-workflows",
      batchSize: clampLimit(process.env.AGENT_WORKFLOW_BATCH_SIZE, 1, 10, 2),
      candidates: [
        { name: "AGENT_WORKFLOW_PROCESSOR_SECRET", value: process.env.AGENT_WORKFLOW_PROCESSOR_SECRET },
        { name: "JOB_PROCESSOR_SECRET", value: process.env.JOB_PROCESSOR_SECRET },
        { name: "CRON_SECRET", value: process.env.CRON_SECRET },
      ],
    }),
    workerProcessor({
      key: "agent-evals",
      label: "回归评测处理",
      endpoint: "/api/jobs/run-agent-evals",
      batchSize: clampLimit(process.env.AGENT_EVAL_MAX_USERS, 1, 100, 20),
      candidates: [
        { name: "AGENT_EVAL_PROCESSOR_SECRET", value: process.env.AGENT_EVAL_PROCESSOR_SECRET },
        { name: "JOB_PROCESSOR_SECRET", value: process.env.JOB_PROCESSOR_SECRET },
        { name: "CRON_SECRET", value: process.env.CRON_SECRET },
      ],
    }),
  ];
}

function workerProcessor({
  key,
  label,
  endpoint,
  batchSize,
  candidates,
}: {
  key: AdminWorkerProcessor["key"];
  label: string;
  endpoint: string;
  batchSize: number;
  candidates: Array<{ name: string; value?: string }>;
}): AdminWorkerProcessor {
  const validation = getConfiguredProcessorSecrets(candidates, label);
  return {
    key,
    label,
    endpoint,
    configured: validation.ok,
    batchSize,
    secretNames: candidates.map((candidate) => candidate.name),
    statusHint: validation.ok ? "secret 已配置，可手动触发" : validation.message,
  };
}

function pushDiagnostic(
  items: AdminDiagnosticItem[],
  item: Omit<AdminDiagnosticItem, "severity"> & { severity: AdminDiagnosticSeverity | null },
) {
  if (!item.severity) return;
  items.push(item as AdminDiagnosticItem);
}

function severityRank(severity: AdminDiagnosticSeverity) {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function isTaskStale(row: AdminTaskListItem, staleMinutes: number) {
  const timestamp = Date.parse(row.updatedAt || row.createdAt || "");
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp > staleMinutes * 60 * 1000;
}

function aggregateGenerations(rows: Record<string, unknown>[]) {
  const moduleMap = new Map<string, AdminBreakdownItem>();
  const modelMap = new Map<string, AdminBreakdownItem>();

  for (const row of rows) {
    const payload = isRecord(row.job_payload) ? row.job_payload : {};
    const module = normalizeModuleFilter(stringValue(payload.kind) || stringValue(payload.module) || inferModuleFromPayload(payload));
    const model = stringValue(row.ai_model) || stringValue(payload.aiModel) || "unknown";
    const statusGroup = normalizeTaskStatusGroup(stringValue(row.status), arrayOfStrings(row.result_urls).length);
    const credits = readGenerationBillingCredits(row, statusGroup);

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

function bumpCostBreakdown(
  map: Map<string, AdminCostBreakdownItem>,
  key: string,
  label: string,
  snapshot: {
    count: number;
    completed: number;
    failed: number;
    running: number;
    grossCredits: number;
    refundCredits: number;
    netCredits: number;
    settledCredits: number;
    inFlightCredits: number;
    marginCredits: number;
  },
) {
  const item = map.get(key) || {
    key,
    label,
    count: 0,
    completed: 0,
    failed: 0,
    running: 0,
    grossCredits: 0,
    refundCredits: 0,
    netCredits: 0,
    settledCredits: 0,
    inFlightCredits: 0,
    marginCredits: 0,
    averageCredits: 0,
    failureRate: 0,
  };
  item.count += snapshot.count;
  item.completed += snapshot.completed;
  item.failed += snapshot.failed;
  item.running += snapshot.running;
  item.grossCredits += snapshot.grossCredits;
  item.refundCredits += snapshot.refundCredits;
  item.netCredits += snapshot.netCredits;
  item.settledCredits += snapshot.settledCredits;
  item.inFlightCredits += snapshot.inFlightCredits;
  item.marginCredits += snapshot.marginCredits;
  map.set(key, item);
}

function finalizeCostBreakdowns(map: Map<string, AdminCostBreakdownItem>) {
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      averageCredits: item.count > 0 ? item.netCredits / item.count : 0,
      failureRate: item.count > 0 ? item.failed / item.count : 0,
    }))
    .sort((a, b) => b.netCredits - a.netCredits)
    .slice(0, 12);
}

function createCostDailyMap(since: Date, days: number) {
  const map = new Map<string, AdminCostDailyItem>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(since.getTime() + (days - 1 - index) * 24 * 60 * 60 * 1000);
    const key = dayKey(day.toISOString());
    map.set(key, createCostDailyItem(key));
  }
  return map;
}

function bumpDailyCreditLog(
  map: Map<string, AdminCostDailyItem>,
  createdAt: string | null,
  row: Record<string, unknown>,
) {
  const day = getCostDailyItem(map, createdAt);
  if (!day) return;
  const amount = numberValue(row.amount);
  if (amount < 0) day.grossCredits += Math.abs(amount);
  if (amount > 0 && nullableString(row.generation_id)) day.refundCredits += amount;
  if (amount > 0 && !nullableString(row.generation_id)) day.adjustmentCredits += amount;
  refreshDailyMargin(day);
}

function bumpDailyGeneration(
  map: Map<string, AdminCostDailyItem>,
  createdAt: string | null,
  snapshot: { settledCredits: number; failed: number },
) {
  const day = getCostDailyItem(map, createdAt);
  if (!day) return;
  day.tasks += 1;
  day.failed += snapshot.failed;
  day.generationSettledCredits += snapshot.settledCredits;
  refreshDailyMargin(day);
}

function bumpDailyWorkflow(map: Map<string, AdminCostDailyItem>, createdAt: string | null, settledCredits: number) {
  const day = getCostDailyItem(map, createdAt);
  if (!day) return;
  day.workflowSettledCredits += settledCredits;
  refreshDailyMargin(day);
}

function getCostDailyItem(map: Map<string, AdminCostDailyItem>, value: string | null) {
  if (!value) return null;
  const key = dayKey(value);
  if (!map.has(key)) return null;
  return map.get(key) || null;
}

function createCostDailyItem(date: string): AdminCostDailyItem {
  return {
    date,
    grossCredits: 0,
    refundCredits: 0,
    adjustmentCredits: 0,
    generationSettledCredits: 0,
    workflowSettledCredits: 0,
    marginCredits: 0,
    tasks: 0,
    failed: 0,
  };
}

function refreshDailyMargin(day: AdminCostDailyItem) {
  day.marginCredits = day.grossCredits - day.refundCredits - day.generationSettledCredits - day.workflowSettledCredits;
}

function dayKey(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value.slice(0, 10);
  return new Date(time).toISOString().slice(0, 10);
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

async function loadUserControlMap(userIds: string[], warnings: string[]) {
  const controls = new Map<string, AdminUserControl>();
  if (!userIds.length) return controls;

  const result = await runQuery<Record<string, unknown>[]>(
    getAdminClient()
      .from("admin_user_controls")
      .select(ADMIN_USER_CONTROL_COLUMNS)
      .in("user_id", userIds),
    "admin user controls",
    warnings,
    true,
  );

  for (const row of result.data || []) {
    const control = mapUserControlRow(row);
    if (control.userId) controls.set(control.userId, control);
  }

  return controls;
}

function mapUserControlRow(row: Record<string, unknown>): AdminUserControl {
  return {
    userId: stringValue(row.user_id),
    status: normalizeUserAccountStatus(row.status),
    generateEnabled: row.generate_enabled !== false,
    supportLevel: normalizeUserSupportLevel(row.support_level),
    reason: nullableString(row.reason),
    note: nullableString(row.note),
    expiresAt: nullableString(row.expires_at),
    updatedByEmail: nullableString(row.updated_by_email),
    updatedAt: nullableString(row.updated_at),
  };
}

function applyUserControl(profile: AdminUserListItem, control: AdminUserControl | undefined): AdminUserListItem {
  if (!control) return profile;
  return {
    ...profile,
    accountStatus: control.status,
    generateEnabled: control.generateEnabled,
    supportLevel: control.supportLevel,
    controlReason: control.reason,
    controlNote: control.note,
    controlExpiresAt: control.expiresAt,
  };
}

function normalizeUserAccountStatus(value: unknown): AdminUserAccountStatus {
  return value === "restricted" || value === "suspended" ? value : "active";
}

function normalizeUserSupportLevel(value: unknown): AdminUserSupportLevel {
  return value === "priority" || value === "watch" ? value : "standard";
}

async function loadFallbackTasks(
  args: { page: number; pageSize: number; status: TaskStatusGroup | ""; module: string; sourceType: string; q: string; stale: boolean },
  warnings: string[],
) {
  const rows: AdminTaskListItem[] = [];
  const offset = (args.page - 1) * args.pageSize;
  const fetchLimit = Math.min(1000, Math.max(args.page * args.pageSize * 2, args.pageSize));
  const loadGenerations = !args.sourceType || args.sourceType === "generation";
  const loadWorkflows = !args.sourceType || args.sourceType === "workflow";

  if (loadGenerations) {
    let query = getAdminClient()
      .from("generations")
      .select(GENERATION_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
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
        .limit(fetchLimit),
      "fallback workflows",
      warnings,
      true,
    );
    rows.push(...(workflowResult.data || []).map(mapWorkflowRow));
  }

  let filtered = rows;
  if (args.status) filtered = filtered.filter((row) => row.statusGroup === args.status);
  if (args.q) filtered = filtered.filter((row) => matchesTaskSearch(row, args.q));
  if (args.stale) filtered = filtered.filter((row) => row.isStale);
  filtered = filtered.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  return {
    rows: filtered.slice(offset, offset + args.pageSize),
    total: filtered.length,
  };
}

function mapTaskQueueRow(row: Record<string, unknown>): AdminTaskListItem {
  const sourceType = stringValue(row.source_type) === "workflow" ? "workflow" : "generation";
  const module = normalizeModuleFilter(stringValue(row.module)) || (sourceType === "workflow" ? "workflow" : "unknown");
  const resultCount = Math.max(0, numberValue(row.result_count));
  const statusGroup = normalizeTaskStatusGroup(stringValue(row.status_group) || stringValue(row.status), resultCount);
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at);
  return {
    id: stringValue(row.id) || stringValue(row.source_id),
    sourceId: stringValue(row.source_id),
    sourceType,
    userId: stringValue(row.user_id),
    module,
    moduleLabel: moduleLabel(module),
    title: stringValue(row.title) || moduleLabel(module),
    status: stringValue(row.status) || stringValue(row.status_group),
    statusGroup,
    progress: clampProgress(row.progress),
    expectedCount: Math.max(1, numberValue(row.expected_count) || 1),
    resultCount,
    inputThumbnails: arrayOfStrings(row.input_thumbnails),
    resultThumbnails: arrayOfStrings(row.result_thumbnails),
    errorMessage: nullableString(row.error_message),
    applyUrl: stringValue(row.apply_url),
    createdAt,
    updatedAt,
    completedAt: nullableString(row.completed_at),
    ...staleTaskMeta(statusGroup, createdAt, updatedAt, resultCount),
  };
}

async function hydrateTaskPreviewThumbnails(rows: AdminTaskListItem[], warnings: string[]) {
  const needsHydration = rows.filter(
    (row) => row.resultCount > row.resultThumbnails.length && row.resultThumbnails.length < ADMIN_TASK_PREVIEW_LIMIT,
  );
  if (!needsHydration.length) return rows;

  const generationIds = needsHydration.filter((row) => row.sourceType === "generation").map((row) => row.sourceId).filter(Boolean);
  const workflowIds = needsHydration.filter((row) => row.sourceType === "workflow").map((row) => row.sourceId).filter(Boolean);
  const resultUrlsById = new Map<string, string[]>();

  if (generationIds.length) {
    const result = await runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("generations")
        .select("id,result_urls")
        .in("id", generationIds),
      "task preview generation thumbnails",
      warnings,
      true,
    );
    for (const row of result.data || []) {
      resultUrlsById.set(stringValue(row.id), arrayOfStrings(row.result_urls).slice(0, ADMIN_TASK_PREVIEW_LIMIT));
    }
  }

  if (workflowIds.length) {
    const result = await runQuery<Record<string, unknown>[]>(
      getAdminClient()
        .from("agent_workflows")
        .select("id,final_outputs")
        .in("id", workflowIds),
      "task preview workflow thumbnails",
      warnings,
      true,
    );
    for (const row of result.data || []) {
      resultUrlsById.set(stringValue(row.id), extractUrls(row.final_outputs).slice(0, ADMIN_TASK_PREVIEW_LIMIT));
    }
  }

  if (!resultUrlsById.size) return rows;
  return rows.map((row) => {
    const hydrated = resultUrlsById.get(row.sourceId) || [];
    if (hydrated.length <= row.resultThumbnails.length) return row;
    return {
      ...row,
      resultThumbnails: uniqueStrings([...row.resultThumbnails, ...hydrated]).slice(0, ADMIN_TASK_PREVIEW_LIMIT),
    };
  });
}

function mapGenerationRow(row: Record<string, unknown>): AdminTaskListItem {
  const payload = isRecord(row.job_payload) ? row.job_payload : {};
  const resultUrls = arrayOfStrings(row.result_urls);
  const module = normalizeModuleFilter(stringValue(payload.kind) || stringValue(payload.module) || inferModuleFromPayload(payload)) || "tryon";
  const status = stringValue(row.status) || "queued";
  const statusGroup = normalizeTaskStatusGroup(status, resultUrls.length);
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at) || nullableString(row.processing_started_at);
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
    resultThumbnails: resultUrls.slice(0, ADMIN_TASK_PREVIEW_LIMIT),
    errorMessage: nullableString(row.error_message),
    applyUrl: `${moduleRoute(module)}?apply=${encodeURIComponent(stringValue(row.id))}`,
    createdAt,
    updatedAt,
    completedAt: nullableString(row.completed_at),
    model: nullableString(row.ai_model) || nullableString(payload.aiModel),
    imageSize: nullableString(row.image_size) || nullableString(payload.imageSize),
    credits: readGenerationBillingCredits(row, statusGroup),
    ...staleTaskMeta(statusGroup, createdAt, updatedAt, resultUrls.length),
  };
}

function mapWorkflowRow(row: Record<string, unknown>): AdminTaskListItem {
  const status = stringValue(row.status) || "queued";
  const resultThumbnails = extractUrls(row.final_outputs).slice(0, ADMIN_TASK_PREVIEW_LIMIT);
  const statusGroup = normalizeTaskStatusGroup(status, resultThumbnails.length);
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at);
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
    inputThumbnails: extractUrls(row.input_images).slice(0, ADMIN_TASK_PREVIEW_LIMIT),
    resultThumbnails,
    errorMessage: nullableString(row.error_message),
    applyUrl: `/agent?workflow=${encodeURIComponent(stringValue(row.id))}`,
    createdAt,
    updatedAt,
    completedAt: nullableString(row.completed_at),
    credits: numberValue(row.cost_settled) || numberValue(row.cost_reserved),
    ...staleTaskMeta(statusGroup, createdAt, updatedAt, resultThumbnails.length),
  };
}

function mapAuditRow(row: Record<string, unknown>): AdminAuditLog {
  return {
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
  };
}

function mapConfigVersion(row: Record<string, unknown>): AdminConfigVersion {
  return {
    id: stringValue(row.id),
    configKey: stringValue(row.config_key),
    status: stringValue(row.status) || "draft",
    value: isRecord(row.value) ? row.value : {},
    createdBy: nullableString(row.created_by),
    publishedAt: nullableString(row.published_at),
    createdAt: nullableString(row.created_at),
  };
}

function parsePromptExperiments(version: AdminConfigVersion, warnings: string[]): AdminPromptExperiment[] {
  const rawExperiments = Array.isArray(version.value.experiments) ? version.value.experiments : [];
  if (!rawExperiments.length && Object.keys(version.value).length > 0) {
    warnings.push(`${PROMPT_EXPERIMENT_CONFIG_KEY}: no experiments array found in version ${version.id}`);
  }

  return rawExperiments
    .map((value, index) => mapPromptExperiment(value, version, index, warnings))
    .filter((item): item is AdminPromptExperiment => Boolean(item));
}

function mapPromptExperiment(
  value: unknown,
  version: AdminConfigVersion,
  index: number,
  warnings: string[],
): AdminPromptExperiment | null {
  if (!isRecord(value)) {
    warnings.push(`${PROMPT_EXPERIMENT_CONFIG_KEY}: experiment ${index + 1} is not an object`);
    return null;
  }

  const id = stringValue(value.id) || `experiment-${index + 1}`;
  const module = normalizeModuleFilter(stringValue(value.module)) || "generalImage";
  const status = normalizePromptExperimentStatus(stringValue(value.status));
  const variants = Array.isArray(value.variants)
    ? value.variants.map((variant, variantIndex) => mapPromptVariant(variant, variantIndex)).filter((item): item is AdminPromptExperimentVariant => Boolean(item))
    : [];
  const traffic = clampLimit(value.traffic, 0, 100, 0);

  if (variants.length < 2) {
    warnings.push(`${id}: at least two variants are recommended for A/B testing`);
  }
  const weightTotal = variants.reduce((sum, variant) => sum + variant.weight, 0);
  if (variants.length >= 2 && weightTotal !== 100) {
    warnings.push(`${id}: variant weights sum to ${weightTotal}, expected 100`);
  }

  return {
    id,
    name: stringValue(value.name) || id,
    module,
    moduleLabel: moduleLabel(module),
    status,
    traffic,
    primaryMetric: stringValue(value.primaryMetric) || "success_rate",
    guardrails: arrayOfStrings(value.guardrails),
    variants,
    owner: nullableString(value.owner),
    notes: nullableString(value.notes),
    startedAt: nullableString(value.startedAt),
    endedAt: nullableString(value.endedAt),
    versionId: version.id,
    versionStatus: version.status,
    versionCreatedAt: version.createdAt,
    versionPublishedAt: version.publishedAt,
  };
}

function mapPromptVariant(value: unknown, index: number): AdminPromptExperimentVariant | null {
  if (!isRecord(value)) return null;
  const key = stringValue(value.key) || `variant-${index + 1}`;
  return {
    key,
    label: stringValue(value.label) || key,
    weight: clampLimit(value.weight, 0, 100, index === 0 ? 50 : 0),
    template: stringValue(value.template),
    notes: nullableString(value.notes),
  };
}

function normalizePromptExperimentStatus(value: string): AdminPromptExperimentStatus {
  return value === "running" || value === "paused" || value === "completed" || value === "draft"
    ? value
    : "draft";
}

function emptyPromptExperimentMetrics(): AdminPromptExperimentOverview["metrics"] {
  return {
    total: 0,
    running: 0,
    draft: 0,
    paused: 0,
    completed: 0,
    coveredModules: 0,
    variants: 0,
    averageTraffic: 0,
  };
}

function mapAgentEvalRun(row: Record<string, unknown>, emails: Map<string, string>): AdminAgentEvalRun {
  const userId = stringValue(row.user_id);
  const total = numberValue(row.total);
  const failed = numberValue(row.failed);
  return {
    id: stringValue(row.id),
    userId,
    email: emails.get(userId) || null,
    total,
    passed: numberValue(row.passed),
    failed,
    score: numberValue(row.score),
    latencyMs: numberValue(row.latency_ms),
    status: total === 0 ? "empty" : failed > 0 ? "failed" : "pass",
    summary: isRecord(row.summary) ? row.summary : {},
    createdAt: nullableString(row.created_at),
  };
}

function mapAgentEvalResult(row: Record<string, unknown>, emails: Map<string, string>): AdminAgentEvalResult {
  const userId = stringValue(row.user_id);
  return {
    id: stringValue(row.id),
    runId: stringValue(row.run_id),
    userId,
    email: emails.get(userId) || null,
    caseId: stringValue(row.case_id),
    title: stringValue(row.title),
    ok: row.ok === true,
    failures: arrayOfStrings(row.failures),
    action: nullableString(row.action),
    module: nullableString(row.module),
    confidence: numberValue(row.confidence),
    traceId: nullableString(row.trace_id),
    createdAt: nullableString(row.created_at),
  };
}

function mapBrainEvalCase(testCase: BrainEvalCase): AdminAgentEvalCase {
  // Agent module disabled: BRAIN_EVAL_CASES is an empty stub, so this
  // function is unreachable at runtime. Restore the typed implementation
  // when bringing back the agent module from `refactor/extract-agent-module`.
  void testCase;
  return {
    id: "",
    title: "",
    expected: [],
    imageCount: 0,
  };
}

function emptyAgentEvalMetrics(): AdminAgentEvalOverview["metrics"] {
  return {
    totalRuns: 0,
    recentRuns: 0,
    avgScore: 0,
    passRate: 0,
    failedRuns: 0,
    failedCases: 0,
    uniqueUsers: 0,
    averageLatencyMs: 0,
    latestRunAt: null,
  };
}

function matchesAgentEvalRunSearch(row: AdminAgentEvalRun, q: string) {
  return [
    row.id,
    row.userId,
    row.email || "",
    row.status,
    String(row.score),
    JSON.stringify(row.summary),
  ].some((value) => value.toLowerCase().includes(q));
}

function matchesAgentEvalResultSearch(row: AdminAgentEvalResult, q: string) {
  return [
    row.id,
    row.runId,
    row.userId,
    row.email || "",
    row.caseId,
    row.title,
    row.action || "",
    row.module || "",
    row.failures.join(" "),
  ].some((value) => value.toLowerCase().includes(q));
}

function mapModerationCase(row: Record<string, unknown>): AdminModerationCase {
  return {
    id: stringValue(row.id),
    sourceType: stringValue(row.source_type),
    sourceId: stringValue(row.source_id),
    action: stringValue(row.action),
    status: stringValue(row.status) || "open",
    reason: nullableString(row.reason),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdBy: nullableString(row.created_by),
    createdAt: nullableString(row.created_at),
    resolvedAt: nullableString(row.resolved_at),
  };
}

function mapOperationRequest(row: Record<string, unknown>): AdminOperationRequest {
  const risk = stringValue(row.risk_level);
  return {
    id: stringValue(row.id),
    requestType: stringValue(row.request_type),
    status: stringValue(row.status) || "pending",
    requestedBy: nullableString(row.requested_by),
    requestedByEmail: nullableString(row.requested_by_email),
    requestedByRole: nullableString(row.requested_by_role),
    approvedBy: nullableString(row.approved_by),
    approvedByEmail: nullableString(row.approved_by_email),
    approvedByRole: nullableString(row.approved_by_role),
    targetType: stringValue(row.target_type),
    targetId: stringValue(row.target_id),
    reason: stringValue(row.reason),
    riskLevel: risk === "high" || risk === "low" ? risk : "medium",
    payload: isRecord(row.payload) ? row.payload : {},
    result: isRecord(row.result) ? row.result : {},
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
    approvedAt: nullableString(row.approved_at),
  };
}

function mapSupportTicket(row: Record<string, unknown>): AdminSupportTicket {
  return {
    id: stringValue(row.id),
    ticketNo: stringValue(row.ticket_no),
    status: normalizeSupportTicketStatus(row.status) || "open",
    priority: normalizeSupportTicketPriority(row.priority) || "medium",
    category: normalizeSupportTicketCategory(row.category) || "other",
    source: stringValue(row.source) || "admin",
    userId: nullableString(row.user_id),
    userEmail: nullableString(row.user_email),
    generationId: nullableString(row.generation_id),
    assetSourceType: nullableString(row.asset_source_type),
    assetSourceId: nullableString(row.asset_source_id),
    title: stringValue(row.title),
    description: stringValue(row.description),
    resolution: nullableString(row.resolution),
    tags: arrayOfStrings(row.tags),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    assignedTo: nullableString(row.assigned_to),
    assignedToEmail: nullableString(row.assigned_to_email),
    createdBy: nullableString(row.created_by),
    createdByEmail: nullableString(row.created_by_email),
    createdByRole: nullableString(row.created_by_role),
    resolvedAt: nullableString(row.resolved_at),
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function createSupportTicketMetrics(rows: AdminSupportTicket[]): AdminSupportTicketList["metrics"] {
  return rows.reduce((metrics, row) => {
    if (row.status === "open") metrics.open += 1;
    if (row.status === "pending") metrics.pending += 1;
    if (row.status === "waiting_user") metrics.waitingUser += 1;
    if (row.status === "resolved") metrics.resolved += 1;
    if (row.status === "closed") metrics.closed += 1;
    if (row.priority === "urgent") metrics.urgent += 1;
    if (row.generationId) metrics.linkedGenerations += 1;
    return metrics;
  }, {
    open: 0,
    pending: 0,
    waitingUser: 0,
    resolved: 0,
    closed: 0,
    urgent: 0,
    linkedGenerations: 0,
  });
}

function matchesSupportTicketSearch(row: AdminSupportTicket, q: string) {
  return [
    row.id,
    row.ticketNo,
    row.status,
    row.priority,
    row.category,
    row.userId || "",
    row.userEmail || "",
    row.generationId || "",
    row.assetSourceType || "",
    row.assetSourceId || "",
    row.title,
    row.description,
    row.assignedToEmail || "",
    row.createdByEmail || "",
    row.tags.join(" "),
  ].some((value) => value.toLowerCase().includes(q));
}

function mapBillingProduct(row: Record<string, unknown>): AdminBillingProduct {
  const stripeProductId =
    pickString(row, ["stripe_product_id", "stripeProductId", "product_id", "productId", "stripe_id", "stripeId"]) ||
    stringValue(row.id);
  const id = stringValue(row.id) || stripeProductId;

  return {
    id,
    stripeProductId,
    name: pickString(row, ["name", "product_name", "productName", "title"]) || stripeProductId || "Unknown product",
    description: pickNullableString(row, ["description", "product_description", "productDescription"]),
    active: booleanValue(pickValue(row, ["active", "is_active", "enabled"]), true),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: pickNullableString(row, ["created_at", "createdAt", "stripe_created_at"]),
    updatedAt: pickNullableString(row, ["updated_at", "updatedAt", "synced_at", "syncedAt"]),
  };
}

function mapBillingPrice(row: Record<string, unknown>, productNames: Map<string, string>): AdminBillingPrice {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const stripePriceId =
    pickString(row, ["stripe_price_id", "stripePriceId", "price_id", "priceId", "stripe_id", "stripeId"]) ||
    stringValue(row.id);
  const stripeProductId = pickString(row, ["stripe_product_id", "stripeProductId", "product_id", "productId"]);
  const recurringInterval = pickNullableString(row, ["recurring_interval", "recurringInterval", "interval", "billing_interval", "billingInterval"]);

  return {
    id: stringValue(row.id) || stripePriceId,
    stripePriceId,
    stripeProductId,
    productName: productNames.get(stripeProductId) || pickNullableString(row, ["product_name", "productName"]),
    nickname: pickNullableString(row, ["nickname", "name", "label"]),
    currency: normalizeCurrency(pickString(row, ["currency"]) || "usd"),
    unitAmount: pickNumber(row, ["unit_amount", "unitAmount", "amount", "amount_total", "amountTotal"]),
    recurringInterval,
    recurringIntervalCount: pickNumber(row, ["recurring_interval_count", "recurringIntervalCount", "interval_count", "intervalCount"]) || (recurringInterval ? 1 : 0),
    type: pickString(row, ["type", "price_type", "priceType"]) || (recurringInterval ? "recurring" : "one_time"),
    active: booleanValue(pickValue(row, ["active", "is_active", "enabled"]), true),
    credits: pickNumber(row, ["credits", "credit_amount", "creditAmount", "credits_granted", "creditsGranted"]) || numberValue(metadata.credits),
    createdAt: pickNullableString(row, ["created_at", "createdAt", "stripe_created_at"]),
  };
}

function mapBillingOrder(row: Record<string, unknown>, emails: Map<string, string>): AdminBillingOrder {
  const userId = pickNullableString(row, ["user_id", "userId"]);

  return {
    id: stringValue(row.id) || pickString(row, ["stripe_checkout_session_id", "stripeCheckoutSessionId", "checkout_session_id", "checkoutSessionId"]),
    userId,
    email: pickNullableString(row, ["email", "user_email", "userEmail", "customer_email", "customerEmail"]) || (userId ? emails.get(userId) || null : null),
    stripeCustomerId: pickNullableString(row, ["stripe_customer_id", "stripeCustomerId", "customer_id", "customerId"]),
    stripeCheckoutSessionId: pickNullableString(row, ["stripe_checkout_session_id", "stripeCheckoutSessionId", "checkout_session_id", "checkoutSessionId"]),
    stripePaymentIntentId: pickNullableString(row, ["stripe_payment_intent_id", "stripePaymentIntentId", "payment_intent_id", "paymentIntentId"]),
    amountTotal: pickNumber(row, ["amount_total", "amountTotal", "amount_paid", "amountPaid", "amount"]),
    currency: normalizeCurrency(pickString(row, ["currency"]) || "usd"),
    status: pickString(row, ["status", "payment_status", "paymentStatus"]) || "unknown",
    refundedAmount: pickNumber(row, ["refunded_amount", "refundedAmount", "amount_refunded", "amountRefunded"]),
    creditsGranted: pickNumber(row, ["credits_granted", "creditsGranted", "credits", "credit_amount", "creditAmount"]),
    createdAt: pickNullableString(row, ["created_at", "createdAt", "paid_at", "paidAt"]),
    updatedAt: pickNullableString(row, ["updated_at", "updatedAt", "synced_at", "syncedAt"]),
  };
}

function mapBillingSubscription(row: Record<string, unknown>, emails: Map<string, string>): AdminBillingSubscription {
  const userId = pickNullableString(row, ["user_id", "userId"]);
  const stripeSubscriptionId =
    pickString(row, ["stripe_subscription_id", "stripeSubscriptionId", "subscription_id", "subscriptionId", "stripe_id", "stripeId"]) ||
    stringValue(row.id);

  return {
    id: stringValue(row.id) || stripeSubscriptionId,
    userId,
    email: pickNullableString(row, ["email", "user_email", "userEmail", "customer_email", "customerEmail"]) || (userId ? emails.get(userId) || null : null),
    stripeCustomerId: pickNullableString(row, ["stripe_customer_id", "stripeCustomerId", "customer_id", "customerId"]),
    stripeSubscriptionId,
    stripePriceId: pickNullableString(row, ["stripe_price_id", "stripePriceId", "price_id", "priceId"]),
    status: pickString(row, ["status", "subscription_status", "subscriptionStatus"]) || "unknown",
    currentPeriodStart: pickNullableString(row, ["current_period_start", "currentPeriodStart"]),
    currentPeriodEnd: pickNullableString(row, ["current_period_end", "currentPeriodEnd"]),
    cancelAtPeriodEnd: booleanValue(pickValue(row, ["cancel_at_period_end", "cancelAtPeriodEnd"]), false),
    canceledAt: pickNullableString(row, ["canceled_at", "canceledAt", "cancelled_at", "cancelledAt"]),
    createdAt: pickNullableString(row, ["created_at", "createdAt"]),
    updatedAt: pickNullableString(row, ["updated_at", "updatedAt", "synced_at", "syncedAt"]),
  };
}

function mapBillingWebhookEvent(row: Record<string, unknown>): AdminBillingWebhookEvent {
  const stripeEventId =
    pickString(row, ["stripe_event_id", "stripeEventId", "event_id", "eventId", "stripe_id", "stripeId"]) ||
    stringValue(row.id);

  return {
    id: stringValue(row.id) || stripeEventId,
    stripeEventId,
    type: pickString(row, ["type", "event_type", "eventType"]) || "unknown",
    status: pickString(row, ["status", "processing_status", "processingStatus"]) || "received",
    attempts: pickNumber(row, ["attempts", "retry_count", "retryCount", "delivery_attempts", "deliveryAttempts"]),
    errorMessage: pickNullableString(row, ["error_message", "errorMessage", "last_error", "lastError"]),
    createdAt: pickNullableString(row, ["created_at", "createdAt", "received_at", "receivedAt"]),
    processedAt: pickNullableString(row, ["processed_at", "processedAt"]),
  };
}

function billingEnvStatus(key: string, label: string, value: unknown): AdminBillingConfigStatus {
  const configured = typeof value === "string" ? value.trim().length > 0 : Boolean(value);
  return {
    key,
    label,
    configured,
    scope: "env",
    statusHint: configured ? "configured" : "missing",
  };
}

function billingTableStatus(
  key: string,
  label: string,
  result: { data: unknown; count: number | null; error: string | null },
): AdminBillingConfigStatus {
  const configured = Array.isArray(result.data);
  const rowCount = Array.isArray(result.data) ? result.count ?? result.data.length : 0;
  return {
    key,
    label,
    configured,
    scope: "table",
    statusHint: configured ? `${rowCount} rows visible` : result.error || "not installed",
  };
}

function pickValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  return stringValue(pickValue(row, keys));
}

function pickNullableString(row: Record<string, unknown>, keys: string[]) {
  return nullableString(pickValue(row, keys));
}

function pickNumber(row: Record<string, unknown>, keys: string[]) {
  return numberValue(pickValue(row, keys));
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active", "enabled"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive", "disabled"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase() || "USD";
}

function compareDateDesc(a: string | null | undefined, b: string | null | undefined) {
  const left = Date.parse(a || "");
  const right = Date.parse(b || "");
  return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
}

function toMajorCurrency(value: number) {
  return Math.round((value / 100) * 100) / 100;
}

function mapSavedView(row: Record<string, unknown>): AdminSavedView {
  const visibility = stringValue(row.visibility);
  return {
    id: stringValue(row.id),
    ownerUserId: nullableString(row.owner_user_id),
    ownerEmail: nullableString(row.owner_email),
    name: stringValue(row.name),
    resource: stringValue(row.resource),
    visibility: visibility === "team" ? "team" : "private",
    filters: isRecord(row.filters) ? row.filters : {},
    columns: Array.isArray(row.columns) ? row.columns : [],
    sort: isRecord(row.sort) ? row.sort : {},
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function mapExportJob(row: Record<string, unknown>): AdminExportJob {
  return {
    id: stringValue(row.id),
    exportType: stringValue(row.export_type),
    status: stringValue(row.status) || "ready",
    requestedBy: nullableString(row.requested_by),
    requestedByEmail: nullableString(row.requested_by_email),
    requestedByRole: nullableString(row.requested_by_role),
    filters: isRecord(row.filters) ? row.filters : {},
    rowCount: numberValue(row.row_count),
    downloadToken: stringValue(row.download_token),
    expiresAt: nullableString(row.expires_at),
    errorMessage: nullableString(row.error_message),
    createdAt: nullableString(row.created_at),
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

function readGenerationBillingCredits(row: Record<string, unknown>, statusGroup: TaskStatusGroup) {
  const used = Math.max(0, numberValue(row.credits_used));
  const reserved = Math.max(0, numberValue(row.credits_cost));
  if (statusGroup === "failed") return 0;
  if (statusGroup === "completed") return used || reserved;
  return reserved;
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

function staleTaskMeta(statusGroup: TaskStatusGroup, createdAt: string | null, updatedAt: string | null, resultCount: number) {
  const base = updatedAt || createdAt;
  const time = base ? Date.parse(base) : NaN;
  const staleMinutes = Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 60000)) : 0;
  const running = statusGroup === "queued" || statusGroup === "running";
  return {
    isStale: running && resultCount <= 0 && staleMinutes >= ADMIN_STALE_TASK_MINUTES,
    staleMinutes,
  };
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
