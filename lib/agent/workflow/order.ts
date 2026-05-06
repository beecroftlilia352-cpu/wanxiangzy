type WorkflowOrderStep = {
  id?: string;
  step_key?: string;
  dependsOn?: string[];
  depends_on?: string[];
};

export function orderWorkflowSteps<T extends WorkflowOrderStep>(steps: T[]): T[] {
  if (steps.length < 2) return steps;

  const byKey = new Map<string, T>();
  for (const step of steps) {
    const keys = [step.step_key, step.id].filter((value): value is string => Boolean(value));
    for (const key of keys) byKey.set(key, step);
  }

  const ordered: T[] = [];
  const visiting = new Set<T>();
  const visited = new Set<T>();
  let hasCycle = false;

  const visit = (step: T) => {
    if (visited.has(step)) return;
    if (visiting.has(step)) {
      hasCycle = true;
      return;
    }

    visiting.add(step);
    for (const dep of getStepDependencies(step)) {
      const depStep = byKey.get(dep);
      if (depStep && depStep !== step) visit(depStep);
    }
    visiting.delete(step);
    visited.add(step);
    ordered.push(step);
  };

  for (const step of steps) visit(step);
  return hasCycle || ordered.length !== steps.length ? steps : ordered;
}

function getStepDependencies(step: WorkflowOrderStep) {
  if (Array.isArray(step.depends_on)) return step.depends_on.filter(Boolean);
  if (Array.isArray(step.dependsOn)) return step.dependsOn.filter(Boolean);
  return [];
}
