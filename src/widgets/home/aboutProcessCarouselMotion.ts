export const MARQUEE_LOOP_SETS = 3;
export const MARQUEE_SPEED_PX_S = 42;
/** Decaimiento por frame a 60fps. Más bajo = costa más larga. */
export const INERTIA_FRICTION = 0.962;
export const INERTIA_MIN_VELOCITY = 22;
export const INERTIA_VELOCITY_TOUCH_BOOST = 1.28;
export const INERTIA_VELOCITY_MOUSE_BOOST = 1.05;
export const DIRECTION_VELOCITY_THRESHOLD = 0.04;
export const DIRECTION_DELTA_THRESHOLD = 20;
/** Activación casi inmediata para tracking 1:1. */
export const DRAG_LOCK_THRESHOLD_PX = 2;
export const DRAG_LOCK_THRESHOLD_TOUCH_PX = 1.5;
export const VERTICAL_SCROLL_THRESHOLD_PX = 16;
/** Tiempo de control del usuario antes de que el marquee retome solo. */
export const USER_CONTROL_IDLE_MS = 2400;
export const SNAP_SCROLL_MS = 480;
export const VELOCITY_SAMPLE_WINDOW_MS = 100;
export const SNAP_EASE = (t: number) => 1 - (1 - t) ** 3;
export type MarqueeFlow = "left" | "right";
export type MarqueeDirection = 1 | -1;

export function directionToFlow(direction: MarqueeDirection): MarqueeFlow {
  return direction === 1 ? "left" : "right";
}

/**
 * El dedo/mouse hacia +X mueve el contenido a la derecha (position baja).
 * direction -1 = marquee hacia la derecha (mismo sentido).
 */
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
