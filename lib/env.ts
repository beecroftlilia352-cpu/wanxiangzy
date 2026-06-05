type EnvCategory = "production-required" | "feature-required" | "optional";
type EnvSeverity = "error" | "warning";

export type EnvContractEntry = {
  name: string;
  category: EnvCategory;
  description: string;
};

export type EnvValidationIssue = {
  name: string;
  category: EnvCategory;
  severity: EnvSeverity;
  message: string;
};

export type ProcessorSecretCandidate = {
  name: string;
  value?: string;
};

export type ProcessorSecretValidation =
  | { ok: true; secrets: string[] }
  | { ok: false; message: string };

const PRODUCTION_REQUIRED_ENV: EnvContractEntry[] = [
  {
    name: "NEXT_PUBLIC_APP_URL",
    category: "production-required",
    description: "Canonical public app origin. Required in production for generated public asset URLs.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    category: "production-required",
    description: "Supabase project URL used by browser and server clients.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    category: "production-required",
    description: "Supabase anon key used by browser and server clients.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    category: "production-required",
    description: "Supabase service role key for privileged server-side operations.",
  },
];

const FEATURE_REQUIRED_ENV: EnvContractEntry[] = [
  {
    name: "LINGYA_API_KEY",
    category: "feature-required",
    description: "Required for Lingya image generation and Lingya-backed prompt analysis.",
  },
  {
    name: "PLATO_API_KEY",
    category: "feature-required",
    description: "Required for GPT-Image-2 through Plato; falls back to LINGYA_API_KEY when empty.",
  },
  {
    name: "LAOZHANG_SEEDANCE_API_KEY or LAOZHANG_API_KEY",
    category: "feature-required",
    description: "Required for AI video generation through LaoZhang Seedance 2.0.",
  },
  {
    name: "XIAOMI_MIMO_API_KEY",
    category: "feature-required",
    description: "Required when ANALYZE_LLM_PROVIDER=xiaomi.",
  },
  {
    name: "IMGBB_API_KEY",
    category: "feature-required",
    description: "Required when IMAGE_STORAGE_PROVIDER=imgbb for user uploads and durable external result-image storage.",
  },
  {
    name: "JOB_PROCESSOR_SECRET or CRON_SECRET",
    category: "feature-required",
    description: "Required by /api/jobs/process-generations.",
  },
  {
    name: "AGENT_WORKFLOW_PROCESSOR_SECRET or JOB_PROCESSOR_SECRET or CRON_SECRET",
    category: "feature-required",
    description: "Required by /api/jobs/process-agent-workflows.",
  },
  {
    name: "AGENT_EVAL_PROCESSOR_SECRET or JOB_PROCESSOR_SECRET or CRON_SECRET",
    category: "feature-required",
    description: "Required by /api/jobs/run-agent-evals.",
  },
];

const ALIYUN_OSS_REQUIRED_ENV: EnvContractEntry[] = [
  {
    name: "ALIYUN_OSS_ACCESS_KEY_ID",
    category: "feature-required",
    description: "Required when IMAGE_STORAGE_PROVIDER=aliyun-oss.",
  },
  {
    name: "ALIYUN_OSS_ACCESS_KEY_SECRET",
    category: "feature-required",
    description: "Required when IMAGE_STORAGE_PROVIDER=aliyun-oss.",
  },
  {
    name: "ALIYUN_OSS_BUCKET",
    category: "feature-required",
    description: "Required when IMAGE_STORAGE_PROVIDER=aliyun-oss.",
  },
  {
    name: "ALIYUN_OSS_REGION",
    category: "feature-required",
    description: "Required when IMAGE_STORAGE_PROVIDER=aliyun-oss.",
  },
  {
    name: "ALIYUN_OSS_PUBLIC_BASE_URL",
    category: "feature-required",
    description: "Required when IMAGE_STORAGE_PROVIDER=aliyun-oss.",
  },
];

const OPTIONAL_ENV: EnvContractEntry[] = [
  { name: "LINGYA_BASE_URL", category: "optional", description: "Lingya API base URL override." },
  { name: "PLATO_BASE_URL", category: "optional", description: "Plato API base URL override." },
  { name: "LAOZHANG_SEEDANCE_BASE_URL", category: "optional", description: "Seedance 2.0 API base URL, default https://api.laozhang.ai/seedance/api/v3." },
  { name: "LAOZHANG_SEEDANCE_MODEL", category: "optional", description: "Seedance 2.0 model override, default doubao-seedance-2-0-fast-260128." },
  { name: "LAOZHANG_SEEDANCE_FIRST_LAST_FRAME_MODEL", category: "optional", description: "Seedance 2.0 first/last-frame model override, default doubao-seedance-2-0-260128." },
  { name: "TRYON_CLOTHING_ANALYZE_API_KEY", category: "optional", description: "Yunwu/OpenAI-compatible API key for try-on clothing recognition; falls back to LINGYA_API_KEY." },
  { name: "TRYON_CLOTHING_ANALYZE_BASE_URL", category: "optional", description: "Yunwu/OpenAI-compatible base URL for try-on clothing recognition." },
  { name: "TRYON_CLOTHING_ANALYZE_MODEL", category: "optional", description: "Vision-capable model for try-on clothing recognition, default gpt-5-nano." },
  { name: "TRYON_CLOTHING_ANALYZE_TIMEOUT_MS", category: "optional", description: "Timeout for try-on clothing recognition requests." },
  { name: "TRYON_REFERENCE_IMAGE_ALLOWED_HOSTS", category: "optional", description: "Comma-separated extra hosts allowed for managed try-on reference scene images." },
  { name: "ANALYZE_LLM_PROVIDER", category: "optional", description: "Prompt analysis provider: xiaomi or lingya." },
  { name: "LINGYA_TEXT_MODEL", category: "optional", description: "Lingya text model override." },
  { name: "LINGYA_VISION_MODEL", category: "optional", description: "Lingya vision model override." },
  { name: "XIAOMI_MIMO_BASE_URL", category: "optional", description: "Xiaomi OpenAI-compatible base URL override." },
  { name: "XIAOMI_MIMO_MODEL", category: "optional", description: "Default Xiaomi model override." },
  { name: "XIAOMI_MIMO_TEXT_MODEL", category: "optional", description: "Xiaomi text model override." },
  { name: "XIAOMI_MIMO_VISION_MODEL", category: "optional", description: "Xiaomi vision model override." },
  { name: "IMAGE_STORAGE_PROVIDER", category: "optional", description: "Image storage adapter: imgbb or aliyun-oss." },
  { name: "NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS", category: "optional", description: "Comma-separated public OSS image hosts that can use x-oss-process thumbnails." },
  { name: "ALIYUN_OSS_PREFIX", category: "optional", description: "Fallback object key prefix when IMAGE_STORAGE_PROVIDER=aliyun-oss." },
  { name: "ALIYUN_OSS_SITE_ASSET_PREFIX", category: "optional", description: "OSS prefix for permanent site assets." },
  { name: "ALIYUN_OSS_UPLOAD_PREFIX", category: "optional", description: "OSS prefix for short-lived user uploads." },
  { name: "ALIYUN_OSS_GENERATED_PREFIX", category: "optional", description: "OSS prefix for medium-lived generated results." },
  { name: "ALIYUN_OSS_FAVORITE_PREFIX", category: "optional", description: "OSS prefix for permanent user favorites." },
  { name: "ALIYUN_OSS_TEMP_PREFIX", category: "optional", description: "OSS prefix for temporary scratch images." },
  { name: "ALIYUN_OSS_ENDPOINT", category: "optional", description: "OSS upload endpoint override, without protocol." },
  { name: "ALIYUN_OSS_SECURITY_TOKEN", category: "optional", description: "Optional STS security token for temporary OSS credentials." },
  { name: "DOWNLOAD_IMAGE_ALLOWED_HOSTS", category: "optional", description: "Extra hosts allowed by /api/download-image." },
  { name: "API_PLATFORM_TEST_ALLOWED_HOSTS", category: "optional", description: "Allowlist for the API platform test proxy." },
  { name: "GENERATION_JOB_BATCH_SIZE", category: "optional", description: "Generation processor batch size." },
  { name: "GENERATION_JOB_STALE_MINUTES", category: "optional", description: "Generation job stale timeout." },
  { name: "AGENT_WORKFLOW_BATCH_SIZE", category: "optional", description: "Agent workflow processor batch size." },
  { name: "AGENT_EVAL_MAX_USERS", category: "optional", description: "Maximum users evaluated per scheduled eval run." },
  { name: "AGENT_VISUAL_AUTO_REGENERATE_ENABLED", category: "optional", description: "Toggle automatic visual repair regeneration." },
  { name: "AGENT_WORKFLOW_SELF_REPAIR_ENABLED", category: "optional", description: "Toggle agent workflow self-repair." },
  { name: "AGENT_BRAIN_V2_ROLLOUT", category: "optional", description: "Agent brain v2 rollout toggle." },
  { name: "AGENT_BRAIN_V2_ROLLOUT_PERCENT", category: "optional", description: "Agent brain v2 percentage rollout." },
  { name: "FASHN_API_KEY", category: "optional", description: "Legacy FASHN provider token." },
  { name: "REPLICATE_API_TOKEN", category: "optional", description: "Legacy Replicate provider token." },
];

const WEAK_PROCESSOR_SECRETS = new Set([
  "change-me",
  "changeme",
  "secret",
  "password",
  "your-secret",
  "your-job-processor-secret",
  "your-cron-secret",
]);

const MIN_PRODUCTION_PROCESSOR_SECRET_LENGTH = 32;

let validated = false;

export function getEnvContract(): EnvContractEntry[] {
  return [...PRODUCTION_REQUIRED_ENV, ...FEATURE_REQUIRED_ENV, ...ALIYUN_OSS_REQUIRED_ENV, ...OPTIONAL_ENV];
}

export function validateEnv(options: { log?: boolean; nodeEnv?: string } = {}): EnvValidationIssue[] {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV;
  const isProduction = nodeEnv === "production";
  const imageStorageProvider = (process.env.IMAGE_STORAGE_PROVIDER || "imgbb").trim().toLowerCase();
  const issues: EnvValidationIssue[] = [];

  for (const entry of PRODUCTION_REQUIRED_ENV) {
    if (!process.env[entry.name]) {
      issues.push({
        name: entry.name,
        category: entry.category,
        severity: isProduction ? "error" : "warning",
        message: isProduction
          ? `${entry.name} is required in production.`
          : `${entry.name} is not set; this is required before production deploys.`,
      });
    }
  }

  for (const entry of FEATURE_REQUIRED_ENV) {
    if (entry.name.includes(" or ")) continue;
    if (entry.name === "IMGBB_API_KEY" && imageStorageProvider === "aliyun-oss") continue;
    if (!process.env[entry.name]) {
      issues.push({
        name: entry.name,
        category: entry.category,
        severity: "warning",
        message: `${entry.name} is not set; related features will fail when used.`,
      });
    }
  }

  if (!process.env.LAOZHANG_SEEDANCE_API_KEY && !process.env.LAOZHANG_API_KEY) {
    issues.push({
      name: "LAOZHANG_SEEDANCE_API_KEY or LAOZHANG_API_KEY",
      category: "feature-required",
      severity: "warning",
      message: "LAOZHANG_SEEDANCE_API_KEY or LAOZHANG_API_KEY is not set; AI video generation will fail when used.",
    });
  }

  if (imageStorageProvider === "aliyun-oss") {
    for (const entry of ALIYUN_OSS_REQUIRED_ENV) {
      if (!process.env[entry.name]) {
        issues.push({
          name: entry.name,
          category: entry.category,
          severity: "warning",
          message: `${entry.name} is required when IMAGE_STORAGE_PROVIDER=aliyun-oss.`,
        });
      }
    }
  }

  if (options.log) logEnvIssues(issues);
  return issues;
}

export function validateEnvOnce(): EnvValidationIssue[] {
  if (validated) return [];
  validated = true;
  return validateEnv({ log: true });
}

export function getConfiguredPublicBaseUrl(options: {
  allowNonProductionFallbacks?: boolean;
  nodeEnv?: string;
} = {}): string | undefined {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV;
  const appUrl = normalizePublicBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (appUrl) return appUrl;

  if (nodeEnv === "production" || options.allowNonProductionFallbacks === false) {
    return undefined;
  }

  return normalizePublicBaseUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.APP_URL ||
      process.env.URL
  );
}

export function requirePublicBaseUrlForRuntime(context: string): string | undefined {
  const publicBaseUrl = getConfiguredPublicBaseUrl();
  if (publicBaseUrl) return publicBaseUrl;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${context} requires NEXT_PUBLIC_APP_URL in production.`);
  }

  return undefined;
}

export function normalizePublicBaseUrl(value?: string | null): string | undefined {
  if (!value) return undefined;

  const raw = value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function getConfiguredProcessorSecrets(
  candidates: ProcessorSecretCandidate[],
  label: string,
  options: { nodeEnv?: string } = {}
): ProcessorSecretValidation {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV;
  const configured = candidates
    .map((candidate) => ({
      name: candidate.name,
      value: candidate.value?.trim() || "",
    }))
    .filter((candidate) => candidate.value.length > 0);

  if (configured.length === 0) {
    return {
      ok: false,
      message: `${label} requires one of: ${candidates.map((candidate) => candidate.name).join(", ")}`,
    };
  }

  const weakReasons = configured
    .map((candidate) => getWeakProductionProcessorSecretReason(candidate.name, candidate.value, nodeEnv))
    .filter((reason): reason is string => Boolean(reason));

  const validSecrets = configured
    .filter((candidate) => !getWeakProductionProcessorSecretReason(candidate.name, candidate.value, nodeEnv))
    .map((candidate) => candidate.value);

  if (validSecrets.length > 0) {
    return { ok: true, secrets: Array.from(new Set(validSecrets)) };
  }

  return {
    ok: false,
    message: weakReasons.length > 0
      ? `${label} has an unsafe production secret: ${weakReasons.join("; ")}`
      : `${label} is not configured.`,
  };
}

function getWeakProductionProcessorSecretReason(
  name: string,
  value: string,
  nodeEnv: string | undefined
): string | undefined {
  if (nodeEnv !== "production") return undefined;

  const normalized = value.trim().toLowerCase();
  if (WEAK_PROCESSOR_SECRETS.has(normalized)) {
    return `${name} uses placeholder value "${value}"`;
  }

  if (value.length < MIN_PRODUCTION_PROCESSOR_SECRET_LENGTH) {
    return `${name} must be at least ${MIN_PRODUCTION_PROCESSOR_SECRET_LENGTH} characters`;
  }

  return undefined;
}

function logEnvIssues(issues: EnvValidationIssue[]): void {
  if (issues.length === 0) return;

  console.warn(`[env] ${issues.map((issue) => issue.message).join(" ")}`);
}

if (process.env.NODE_ENV !== "test") {
  validateEnvOnce();
}
