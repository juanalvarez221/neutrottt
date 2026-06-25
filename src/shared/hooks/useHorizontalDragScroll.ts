"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

type DragScrollOptions = {
  /** Minimum horizontal movement (px) before treating as drag vs tap */
  dragThreshold?: number;
  onDragStart?: () => void;
  onDragEnd?: (velocityPxPerMs: number) => void;
};

export function useHorizontalDragScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { dragThreshold = 6, onDragStart, onDragEnd }: DragScrollOptions = {},
) {
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const movedRef = useRef(false);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);

  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;

  const wasDragged = useCallback(() => movedRef.current, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch") return;

      pointerIdRef.current = event.pointerId;
      startXRef.current = event.clientX;
      startScrollLeftRef.current = el.scrollLeft;
      lastXRef.current = event.clientX;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
      movedRef.current = false;
      draggingRef.current = true;
      el.classList.add("is-dragging");
      onDragStartRef.current?.();
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
      const delta = event.clientX - startXRef.current;
      if (Math.abs(delta) > dragThreshold) {
        movedRef.current = true;
        el.scrollLeft = startScrollLeftRef.current - delta;
      }

      const now = performance.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        velocityRef.current = (event.clientX - lastXRef.current) / dt;
      }
      lastXRef.current = event.clientX;
      lastTimeRef.current = now;
    };

    const endDrag = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const velocity = velocityRef.current;
      draggingRef.current = false;
      pointerIdRef.current = null;
      el.classList.remove("is-dragging");
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      if (movedRef.current) {
        onDragEndRef.current?.(velocity);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("lostpointercapture", () => {
      draggingRef.current = false;
      el.classList.remove("is-dragging");
    });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
    };
  }, [ref, dragThreshold]);

  return { wasDragged };
}
