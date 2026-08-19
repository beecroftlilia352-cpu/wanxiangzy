/**
 * Exponential backoff for idle queue polling loops.
 *
 * Loops that claim work from PostgreSQL should poll quickly while there is
 * work, and back off when claims come back empty so an idle deployment does
 * not hammer the database. `consecutiveEmpty` starts at 1 on the first empty
 * claim; the first delay is `baseMs`, doubling with each further empty claim
 * up to `maxMs`. The first non-empty claim resets the counter.
 */
export function emptyQueueDelayMs(
  consecutiveEmpty: number,
  baseMs: number,
  maxMs: number,
  factor = 2,
): number {
  const base = Math.max(1, Math.floor(baseMs));
  const max = Math.max(base, Math.floor(maxMs));
  const safeExponent = Math.max(0, Math.min(consecutiveEmpty - 1, 40));
  return Math.min(max, base * Math.pow(factor, safeExponent));
}
