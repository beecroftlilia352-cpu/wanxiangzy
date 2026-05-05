import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import type { ChatImageRole } from "@/lib/agent/types";

export type WorkflowMode = "auto" | "chat" | "agent";

export type WorkflowStatus =
  | "draft"
  | "planned"
  | "needs_confirmation"
  | "confirmed"
  | "queued"
  | "running"
  | "waiting_user"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type WorkflowStepStatus =
  | "pending"
  | "ready"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting_user"
  | "cancelled";

export type WorkflowToolType =
  | "text_to_image"
  | "image_to_image"
  | "tryon"
  | "pose_variation"
  | "garment_3d"
  | "commerce_detail"
  | "commerce_creative"
  | "background_replace"
  | "select_image"
  | "image_quality_check"
  | "prompt_repair"
  | "image_to_video"
  | "image_to_3d_asset";

export type WorkflowAssetKind = "image" | "video" | "3d_asset";
export type WorkflowAssetRole = "source" | "intermediate" | "final";

export type ModelCapabilityKey =
  | "text_to_image"
  | "image_to_image"
  | "multi_image"
  | "video"
  | "3d_asset";

export type WorkflowInputImage = {
  index: number;
  url: string;
  role?: ChatImageRole | ImageSemanticRole;
  fileName?: string;
};

export type ImageSemanticRole =
  | "auto"
  | "person"
  | "clothing"
  | "product"
  | "background"
  | "style"
  | "source"
  | "reference"
  | "face"
  | "unknown";

export type ImageRoleResolution = {
  ref: string;
  imageIndex: number;
  role: ImageSemanticRole;
  confidence: number;
  reason?: string;
};

export type WorkflowStepOutputShape = {
  imageUrls?: boolean;
  videoUrls?: boolean;
  selectedImageUrl?: boolean;
  text?: boolean;
};

export type WorkflowStepPlan = {
  id: string;
  type: WorkflowToolType;
  title: string;
  dependsOn: string[];
  input: Record<string, unknown>;
  params: Record<string, unknown>;
  expectedOutput: WorkflowStepOutputShape;
  riskNotes?: string[];
};

export type WorkflowPlan = {
  intent: string;
  summary: string;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
  imageRoles: ImageRoleResolution[];
  userConstraints: string[];
  assumptions: string[];
  steps: WorkflowStepPlan[];
};

export type PlanValidationIssue = {
  code: string;
  message: string;
  stepId?: string;
  severity: "error" | "warning";
};

export type PlanValidationResult = {
  ok: boolean;
  repairedPlan?: WorkflowPlan;
  errors: PlanValidationIssue[];
  warnings: PlanValidationIssue[];
  clarificationQuestion?: string;
  blockedStepIds: string[];
};

export type ToolCostPolicy = {
  baseCredits: number;
  perImage?: boolean;
  free?: boolean;
};

export type ToolRetryPolicy = {
  maxAttempts: number;
  retryable: boolean;
};

export type ToolDefinition = {
  type: WorkflowToolType;
  enabled: boolean;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredCapabilities: ModelCapabilityKey[];
  costPolicy: ToolCostPolicy;
  retryPolicy: ToolRetryPolicy;
  riskLevel: "low" | "medium" | "high";
};

export type WorkflowCostEstimate = {
  total: number;
  reserve: number;
  currency: "credits";
  steps: Array<{
    stepId: string;
    toolType: WorkflowToolType;
    estimatedCredits: number;
    reason: string;
  }>;
};

export type WorkflowRecord = {
  id: string;
  user_id: string;
  conversation_id?: string | null;
  status: WorkflowStatus;
  intent?: string | null;
  summary?: string | null;
  mode: WorkflowMode;
  input_images: WorkflowInputImage[];
  active_plan_version_id?: string | null;
  final_outputs: WorkflowStepResultOutput | null;
  cost_estimate: WorkflowCostEstimate | null;
  cost_reserved: number;
  cost_settled: number;
  idempotency_key?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowStepRecord = {
  id: string;
  workflow_id: string;
  step_key: string;
  type: WorkflowToolType;
  title: string;
  status: WorkflowStepStatus;
  depends_on: string[];
  input: Record<string, unknown>;
  params: Record<string, unknown>;
  output: WorkflowStepResultOutput | null;
  quality: QualityCheckResult | null;
  error_message?: string | null;
  retry_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowEventType =
  | "plan_created"
  | "plan_validated"
  | "plan_repaired"
  | "workflow_created"
  | "workflow_confirmed"
  | "credit_reserved"
  | "workflow_queued"
  | "step_queued"
  | "step_started"
  | "provider_called"
  | "asset_uploaded"
  | "quality_checked"
  | "step_completed"
  | "step_failed"
  | "step_retried"
  | "step_skipped"
  | "workflow_completed"
  | "workflow_partially_completed"
  | "workflow_failed"
  | "workflow_cancelled"
  | "credit_settled"
  | "credit_released";

export type WorkflowEventRecord = {
  id: string;
  workflow_id: string;
  step_id?: string | null;
  type: WorkflowEventType;
  message?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type WorkflowAssetRecord = {
  id: string;
  user_id: string;
  workflow_id?: string | null;
  step_id?: string | null;
  kind: WorkflowAssetKind;
  role: WorkflowAssetRole;
  url: string;
  provider?: string | null;
  model?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WorkflowStepResultOutput = {
  imageUrls?: string[];
  videoUrls?: string[];
  selectedImageUrl?: string;
  assetIds?: string[];
  text?: string;
};

export type PromptTraceItem = {
  index: number;
  toolType: WorkflowToolType;
  model: LingyaModel;
  promptKind: string;
  prompt: string;
  compiledPrompt: string;
  createdAt: string;
};

export type ProviderTraceItem = {
  provider: string;
  model: string;
  status: "ok" | "failed";
  latencyMs?: number;
  error?: string;
};

export type QualityCheckResult = {
  ok: boolean;
  score: number;
  checks: Array<{
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
};

export type StepExecutionInput = {
  workflow: WorkflowRecord;
  step: WorkflowStepRecord;
  steps: WorkflowStepRecord[];
  inputImages: WorkflowInputImage[];
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
};

export type StepExecutionResult = {
  output: WorkflowStepResultOutput;
  promptTrace?: PromptTraceItem[];
  providerTrace?: ProviderTraceItem[];
  quality?: QualityCheckResult;
};

export type GenerationDefaults = {
  model: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  count: number;
};
