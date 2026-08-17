export type TrackedTouchIds = readonly [number, number];

export interface TouchPointLike {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * Locks a pinch to the two touches that started it. TouchList ordering may
 * change when another finger lands or lifts, so array position is not stable.
 */
export function readTrackedTouchPair(
  touches: ArrayLike<TouchPointLike>,
  touchIds?: TrackedTouchIds,
) {
  if (!touchIds && touches.length !== 2) return null;
  const ids: TrackedTouchIds = touchIds ?? [touches[0].identifier, touches[1].identifier];
  let first: TouchPointLike | undefined;
  let second: TouchPointLike | undefined;
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index];
    if (touch.identifier === ids[0]) first = touch;
    if (touch.identifier === ids[1]) second = touch;
  }
  if (!first || !second) return null;
  return { first, second, touchIds: ids };
}
