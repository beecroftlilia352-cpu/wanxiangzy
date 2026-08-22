import type { AiRouteContext } from "@/lib/ai-control-plane/types";

export type AiServiceTier = "standard" | "vip";

export type AiTenantConcurrencyPolicy = {
  serviceTier: AiServiceTier;
  userGlobalConcurrency: number;
  userDeploymentConcurrency: number;
  taskImageConcurrency: number;
};

const DEFAULTS = Object.freeze({
  // Image generation is primarily upstream I/O. Keep a meaningful tenant
  // guard, but do not serialize normal multi-image work behind a 4/2 gate.
  standard: { userGlobal: 12, userDeployment: 6, taskImage: 6 },
  vip: { userGlobal: 24, userDeployment: 12, taskImage: 8 },
});

export function getAiTenantConcurrencyPolicy(
  context: Pick<AiRouteContext, "serviceTier"> = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): AiTenantConcurrencyPolicy {
  const standard = {
    userGlobal: integerEnv(env, "AI_USER_CONCURRENCY_STANDARD", DEFAULTS.standard.userGlobal),
    userDeployment: integerEnv(env, "AI_USER_DEPLOYMENT_CONCURRENCY_STANDARD", DEFAULTS.standard.userDeployment),
    taskImage: integerEnv(env, "GENERATION_TASK_IMAGE_CONCURRENCY_STANDARD", DEFAULTS.standard.taskImage),
  };
  const vip = {
    userGlobal: integerEnv(env, "AI_USER_CONCURRENCY_VIP", DEFAULTS.vip.userGlobal),
    userDeployment: integerEnv(env, "AI_USER_DEPLOYMENT_CONCURRENCY_VIP", DEFAULTS.vip.userDeployment),
    taskImage: integerEnv(env, "GENERATION_TASK_IMAGE_CONCURRENCY_VIP", DEFAULTS.vip.taskImage),
  };

  assertOrdered("AI_USER_CONCURRENCY", standard.userGlobal, vip.userGlobal);
  assertOrdered("AI_USER_DEPLOYMENT_CONCURRENCY", standard.userDeployment, vip.userDeployment);
  assertOrdered("GENERATION_TASK_IMAGE_CONCURRENCY", standard.taskImage, vip.taskImage);
  assertWithinGlobal("standard", standard);
  assertWithinGlobal("vip", vip);

  const serviceTier: AiServiceTier = context.serviceTier === "vip" ? "vip" : "standard";
  const selected = serviceTier === "vip" ? vip : standard;
  return {
    serviceTier,
    userGlobalConcurrency: selected.userGlobal,
    userDeploymentConcurrency: selected.userDeployment,
    taskImageConcurrency: selected.taskImage,
  };
}

export function tenantGlobalScope(userId: string) {
  return `tenant:${normalizeScopePart(userId)}:global`;
}

export function tenantDeploymentScope(userId: string, deploymentId: string) {
  return `tenant:${normalizeScopePart(userId)}:deployment:${normalizeScopePart(deploymentId)}`;
}

export function providerAccountScope(providerId: string, capacityGroup?: string) {
  return `provider-account:${normalizeScopePart(capacityGroup || providerId)}`;
}

function integerEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback: number,
) {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 64) {
    throw new Error(`[ai-fairness] ${key} must be an integer between 1 and 64`);
  }
  return parsed;
}

function assertOrdered(name: string, standard: number, vip: number) {
  if (vip < standard) {
    throw new Error(`[ai-fairness] ${name}_VIP must be greater than or equal to ${name}_STANDARD`);
  }
}

function assertWithinGlobal(
  tier: AiServiceTier,
  value: { userGlobal: number; userDeployment: number; taskImage: number },
) {
  if (value.userDeployment > value.userGlobal) {
    throw new Error(`[ai-fairness] ${tier} per-deployment concurrency cannot exceed user global concurrency`);
  }
  if (value.taskImage > value.userGlobal) {
    throw new Error(`[ai-fairness] ${tier} per-task concurrency cannot exceed user global concurrency`);
  }
}

function normalizeScopePart(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 160);
  if (!normalized) throw new Error("[ai-fairness] capacity scope identifier is required");
  return normalized;
}
