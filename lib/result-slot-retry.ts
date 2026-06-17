export function normalizeRetryResultIndex(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const index = Math.floor(numeric);
  return index >= 0 ? index : null;
}

export function getRetryDisplayExpectedCount(params: {
  retryIndex: number | null;
  currentExpectedCount: number;
  previousUrls: string[];
  fallbackExpectedCount: number;
}) {
  if (params.retryIndex === null) return Math.max(1, params.fallbackExpectedCount);
  return Math.max(
    1,
    params.currentExpectedCount,
    params.previousUrls.length,
    params.retryIndex + 1
  );
}

export function buildRetryPendingResultUrls(previousUrls: string[], retryIndex: number | null, expectedCount: number) {
  if (retryIndex === null) return [];
  const next = previousUrls.slice();
  const targetLength = Math.max(1, expectedCount, retryIndex + 1, next.length);
  while (next.length < targetLength) next.push("");
  next[retryIndex] = "";
  return next;
}

export function mergeRetryResultUrls(
  previousUrls: string[],
  retryIndex: number | null,
  retryUrls: Array<string | null | undefined>,
  expectedCount?: number
) {
  const completedRetryUrl = retryUrls.find((url): url is string => typeof url === "string" && url.trim().length > 0)?.trim();
  if (retryIndex === null) return retryUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0);

  const next = previousUrls.slice();
  const targetLength = Math.max(1, expectedCount || 0, retryIndex + 1, next.length);
  while (next.length < targetLength) next.push("");
  if (completedRetryUrl) next[retryIndex] = completedRetryUrl;
  return next;
}
