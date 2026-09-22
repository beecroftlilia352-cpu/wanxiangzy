export const AI_CONTROL_PLANE_CONFIG_KEY = "ai.control-plane.v1";
export const AI_CONTROL_PLANE_SCHEMA_VERSION = 1 as const;

export type AiModality = "image" | "text" | "vision" | "video" | "audio" | "embedding";
export type AiRoutingMode = "stable" | "smart";
export type AiProviderProtocol =
  | "openai-image"
  | "gemini-native"
  | "openai-chat"
  | "newapi-video"
  /** kie.ai 任务制生图：createTask 提交 + recordInfo 轮询。 */
  | "kie-job";

export type AiDeploymentAdapterConfig = {
  authMode?: "bearer" | "x-api-key" | "x-goog-api-key";
  generationPath?: string;
  editPath?: string;
  statusPath?: string;
  staticParameters?: Record<string, string | number | boolean>;
  /**
   * kie-job：本次请求携带输入图时使用的上游模型 ID。
   * kie 上 gpt-image-2 与 gpt-image-2-5-* 的文生图 / 图生图是两个不同的模型 ID，
   * 而一个部署只绑定一个 upstreamModel，因此这里声明图生图模型。
   */
  editUpstreamModel?: string;
  /** kie-job：输入图数组的字段名（默认 image_input；nano-banana-2-lite 为 image_urls，gpt-image 系列为 input_urls）。 */
  imageInputField?: string;
  /** kie-job：尺寸字段名（默认 resolution；取 none 表示该上游模型不接受尺寸字段）。 */
  imageSizeField?: string;
};

export type AiModelLocalizedPresentation = {
  title?: string;
  shortTitle?: string;
  description?: string;
  badge?: string;
};

export type AiModelPresentation = {
  shortTitle?: string;
  badge?: string;
  iconUrl?: string;
  coverUrl?: string;
  group?: string;
  tags?: string[];
  sortOrder?: number;
  featured?: boolean;
  locales?: Record<string, AiModelLocalizedPresentation>;
};

export type AiLogicalModel = {
  id: string;
  displayName: string;
  modality: AiModality;
  description?: string;
  enabled: boolean;
  userVisible: boolean;
  capabilities: string[];
  defaultRoutingMode: AiRoutingMode;
  /** Customer-facing credits, keyed by a product dimension such as 1K/2K/4K. */
  creditPrices?: Record<string, number>;
  /** Cross-model substitution is disabled unless this list explicitly allows it. */
  compatibleFallbackModelIds?: string[];
  /** User-facing catalog content. Runtime/provider details never leak through this object. */
  presentation?: AiModelPresentation;
};

export type AiProviderEndpoint = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  region?: string;
  timeoutMs: number;
  /** Shared upstream account bulkhead. Defaults to provider id when omitted. */
  capacityGroup?: string;
  capacityMaxConcurrency?: number;
  /** Optional aggregate account RPM window; omitted means deployment limits apply. */
  capacityRequestsPerMinute?: number;
  capacityBurst?: number;
  notes?: string;
};

export type AiDeploymentCost = {
  perRequestUsd?: number;
  perImageUsd?: number;
  perSecondUsd?: number;
  perMillionInputUnitsUsd?: number;
  perMillionOutputUnitsUsd?: number;
};

export type AiModelDeployment = {
  id: string;
  modelId: string;
  providerId: string;
  upstreamModel: string;
  protocol: AiProviderProtocol;
  enabled: boolean;
  /** Lower number is preferred. Equal priorities form one load-balanced pool. */
  priority: number;
  /** Relative share inside the same priority pool. */
  weight: number;
  maxConcurrency: number;
  requestsPerMinute: number;
  burst: number;
  asyncMode?: boolean;
  capabilities?: string[];
  cost?: AiDeploymentCost;
  qualityScore?: number;
  metadata?: Record<string, string | number | boolean>;
  /** Safe, declarative variations handled by the selected protocol adapter. */
  adapterConfig?: AiDeploymentAdapterConfig;
};

export type AiSmartRoutingWeights = {
  reliability: number;
  latency: number;
  cost: number;
  capacity: number;
  quality: number;
};

export type AiRoutingPolicy = {
  maxAttempts: number;
  leaseTtlSeconds: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  circuitFailureThreshold: number;
  circuitMinimumSamples: number;
  circuitOpenSeconds: number;
  halfOpenMaxRequests: number;
  smartWeights: AiSmartRoutingWeights;
};

export type AiControlPlaneConfig = {
  schemaVersion: typeof AI_CONTROL_PLANE_SCHEMA_VERSION;
  models: AiLogicalModel[];
  providers: AiProviderEndpoint[];
  deployments: AiModelDeployment[];
  policy: AiRoutingPolicy;
  updatedAt?: string;
  updatedFrom?: string;
};

export type AiProviderHealth = {
  deploymentId: string;
  circuitState: "closed" | "open" | "half_open";
  consecutiveFailures: number;
  sampleCount: number;
  ewmaSuccessRate: number;
  ewmaLatencyMs: number;
  openedUntil?: string | null;
  rateLimitedUntil?: string | null;
};

export type AiRouteContext = {
  requestId?: string;
  generationId?: string;
  /** Stable logical slot within one multi-output generation. */
  slotIndex?: number;
  userId?: string;
  serviceTier?: "standard" | "vip";
  /** Aborts upstream work when the durable generation execution lease is lost. */
  executionSignal?: AbortSignal;
  routingMode?: AiRoutingMode;
  allowCrossModelFallback?: boolean;
  requiredCapabilities?: string[];
  /** Async provider tasks must resume on the deployment that created them. */
  requiredDeploymentId?: string;
};

export type AiResolvedDeployment = AiModelDeployment & {
  provider: AiProviderEndpoint;
  apiKey: string;
  health: AiProviderHealth;
  score: number;
  selectionReason: Record<string, string | number | boolean>;
  /** Per-attempt deadline controlled by the provider endpoint timeout. */
  abortSignal?: AbortSignal;
};

export type AiControlPlaneIssue = {
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type AiProviderMetric = {
  deploymentId: string;
  modelId: string;
  providerId: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  estimatedCostUsd: number;
  lastRequestAt: string | null;
};

export type AiControlPlanePublicProvider = Omit<AiProviderEndpoint, "apiKey"> & {
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
};

export type AiControlPlanePublicConfig = Omit<AiControlPlaneConfig, "providers"> & {
  providers: AiControlPlanePublicProvider[];
};
