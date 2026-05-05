import type { AgentBrainDecision, AgentBrainRequest } from "@/lib/agent/brain/types";
import { runAgentBrainToolLoop } from "@/lib/agent/brain/tool-loop";

export async function runAgentBrainV2(request: AgentBrainRequest): Promise<AgentBrainDecision> {
  return runAgentBrainToolLoop(request);
}
