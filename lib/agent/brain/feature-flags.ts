export type AgentFeatureFlags = {
  brainV2: boolean;
  memory: boolean;
  feedback: boolean;
  tracePanel: boolean;
  selfRepair: boolean;
  rolloutPercent: number;
  userBucket: number;
};

export function getAgentFeatureFlags(userId?: string | null): AgentFeatureFlags {
  const rolloutPercent = clampPercent(process.env.AGENT_BRAIN_V2_ROLLOUT_PERCENT ?? process.env.AGENT_BRAIN_V2_ROLLOUT ?? "100");
  const userBucket = bucketUser(userId || "anonymous");
  const brainV2 = boolEnv("AGENT_BRAIN_V2_ENABLED", true) && userBucket < rolloutPercent;
  return {
    brainV2,
    memory: brainV2 && boolEnv("AGENT_MEMORY_ENABLED", true),
    feedback: boolEnv("AGENT_FEEDBACK_ENABLED", true),
    tracePanel: boolEnv("AGENT_TRACE_PANEL_ENABLED", true),
    selfRepair: boolEnv("AGENT_WORKFLOW_SELF_REPAIR_ENABLED", true),
    rolloutPercent,
    userBucket,
  };
}

function boolEnv(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function clampPercent(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

function bucketUser(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}
