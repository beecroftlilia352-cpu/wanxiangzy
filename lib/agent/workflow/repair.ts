import type { WorkflowPlan } from "@/lib/agent/workflow/types";
import { getWorkflowTool } from "@/lib/agent/workflow/tools";

export function repairWorkflowPlan(plan: WorkflowPlan): { plan: WorkflowPlan; changed: boolean; notes: string[] } {
  let changed = false;
  const notes: string[] = [];
  const stepIds = new Set<string>();

  const steps = plan.steps.map((step, index) => {
    const next = { ...step };
    const cleanId = next.id?.trim() || `step_${index + 1}`;
    if (cleanId !== next.id) changed = true;
    next.id = uniquifyId(cleanId, stepIds);
    if (next.id !== cleanId) {
      changed = true;
      notes.push(`修复重复 step id：${cleanId} -> ${next.id}`);
    }
    stepIds.add(next.id);

    next.dependsOn = next.dependsOn.filter((id) => id !== next.id);
    if (!getWorkflowTool(next.type)?.enabled && (next.type === "image_to_video" || next.type === "image_to_3d_asset")) {
      notes.push(`${getWorkflowTool(next.type)?.title || next.type} 当前未启用，保留为不可执行提示。`);
    }
    return next;
  });

  return {
    plan: { ...plan, steps },
    changed,
    notes,
  };
}

function uniquifyId(id: string, seen: Set<string>) {
  if (!seen.has(id)) return id;
  let suffix = 2;
  while (seen.has(`${id}_${suffix}`)) suffix += 1;
  return `${id}_${suffix}`;
}
