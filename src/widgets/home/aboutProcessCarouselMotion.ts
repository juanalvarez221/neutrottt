export const MARQUEE_LOOP_SETS = 2;
export const MARQUEE_SPEED_PX_S = 54;
export const INERTIA_FRICTION = 0.93;
export const INERTIA_MIN_VELOCITY = 0.28;
export const INERTIA_VELOCITY_TOUCH_BOOST = 1.22;
export const DIRECTION_VELOCITY_THRESHOLD = 0.08;
export const DIRECTION_DELTA_THRESHOLD = 32;
export const DRAG_LOCK_THRESHOLD_PX = 6;
export const DRAG_LOCK_THRESHOLD_TOUCH_PX = 3;
export const VERTICAL_SCROLL_THRESHOLD_PX = 12;
export const SNAP_SCROLL_MS = 420;
export const VELOCITY_SAMPLE_WINDOW_MS = 110;
export const SNAP_EASE = (t: number) => 1 - (1 - t) ** 3;
export type MarqueeFlow = "left" | "right";
export type MarqueeDirection = 1 | -1;

export function directionToFlow(direction: MarqueeDirection): MarqueeFlow {
  return direction === 1 ? "left" : "right";
}

export function resolveMarqueeDirection(
  pointerDeltaPx: number,
  velocityPxPerMs: number,
): MarqueeDirection | null {
  if (Math.abs(velocityPxPerMs) >= DIRECTION_VELOCITY_THRESHOLD) {
    return velocityPxPerMs > 0 ? -1 : 1;
  }

  if (Math.abs(pointerDeltaPx) >= DIRECTION_DELTA_THRESHOLD) {
    return pointerDeltaPx > 0 ? -1 : 1;
  }

  return null;
}
