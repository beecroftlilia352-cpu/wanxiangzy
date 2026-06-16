export type AdminMetric = {
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "good" | "warning" | "danger";
};

export type AdminBreakdownItem = {
  key: string;
  label: string;
  count: number;
  failed: number;
  running: number;
  credits: number;
};
