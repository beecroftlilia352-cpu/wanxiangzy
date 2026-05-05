import { setStepStatus } from "@/lib/agent/workflow/repository";
import type { WorkflowStepRecord, WorkflowStepStatus } from "@/lib/agent/workflow/types";

export async function resetDependentSteps(steps: WorkflowStepRecord[], changedStepKey: string) {
  const descendants = getDependentSteps(steps, changedStepKey);
  for (const step of descendants) {
    if (step.status === "running") continue;
    await setStepStatus(step.id, "pending", {
      output: null,
      quality: null,
      errorMessage: null,
    });
  }
}

export async function skipDependentSteps(steps: WorkflowStepRecord[], changedStepKey: string) {
  const descendants = getDependentSteps(steps, changedStepKey);
  for (const step of descendants) {
    if (step.status === "completed" || step.status === "running") continue;
    await setStepStatus(step.id, "skipped", {
      errorMessage: null,
    });
  }
}

export async function queueSatisfiedPendingSteps(
  steps: WorkflowStepRecord[],
  statusOverrides: Record<string, WorkflowStepStatus> = {}
) {
  const completed = new Set(
    steps
      .filter((step) => (statusOverrides[step.step_key] || step.status) === "completed")
      .map((step) => step.step_key)
  );

  for (const step of steps) {
    const status = statusOverrides[step.step_key] || step.status;
    if (status !== "pending") continue;
    if (step.depends_on.every((dep) => completed.has(dep))) {
      await setStepStatus(step.id, "ready");
    }
  }
}

function getDependentSteps(steps: WorkflowStepRecord[], changedStepKey: string) {
  const touched = new Set([changedStepKey]);
  const descendants: WorkflowStepRecord[] = [];
  let changed = true;

  while (changed) {
    changed = false;
    for (const step of steps) {
      if (touched.has(step.step_key)) continue;
      if (!step.depends_on.some((dep) => touched.has(dep))) continue;
      touched.add(step.step_key);
      descendants.push(step);
      changed = true;
    }
  }

  return descendants;
}
