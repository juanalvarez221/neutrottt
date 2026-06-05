"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

type DragScrollOptions = {
  /** Minimum horizontal movement (px) before treating as drag vs tap */
  dragThreshold?: number;
};

export function useHorizontalDragScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { dragThreshold = 6 }: DragScrollOptions = {},
) {
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const movedRef = useRef(false);
  const draggingRef = useRef(false);

  const wasDragged = useCallback(() => movedRef.current, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // Touch: scroll nativo horizontal; capturar el pointer bloquea swipe y scroll vertical.
      if (event.pointerType === "touch") return;

      pointerIdRef.current = event.pointerId;
      startXRef.current = event.clientX;
      startScrollLeftRef.current = el.scrollLeft;
      movedRef.current = false;
      draggingRef.current = true;
      el.classList.add("is-dragging");
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
    };

    const endDrag = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      draggingRef.current = false;
      pointerIdRef.current = null;
      el.classList.remove("is-dragging");
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
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
