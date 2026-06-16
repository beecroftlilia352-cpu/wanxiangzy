export type AdminCostBreakdownItem = {
  key: string;
  label: string;
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
  averageCredits: number;
  failureRate: number;
};

export type AdminCostDailyItem = {
  date: string;
  grossCredits: number;
  refundCredits: number;
  adjustmentCredits: number;
  generationSettledCredits: number;
  workflowSettledCredits: number;
  marginCredits: number;
  tasks: number;
  failed: number;
};

export type AdminCostReport = {
  days: number;
  since: string;
  until: string;
  metrics: {
    grossCredits: number;
    refundCredits: number;
    adjustmentCredits: number;
    netCredits: number;
    generationReservedCredits: number;
    generationSettledCredits: number;
    workflowReservedCredits: number;
    workflowSettledCredits: number;
    inFlightCredits: number;
    failedReservedCredits: number;
    marginCredits: number;
    marginRate: number;
    generationCount: number;
    workflowCount: number;
    completedCount: number;
    failedCount: number;
    runningCount: number;
  };
  modules: AdminCostBreakdownItem[];
  models: AdminCostBreakdownItem[];
  daily: AdminCostDailyItem[];
  assumptions: string[];
  warnings: string[];
};
