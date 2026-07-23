/**
 * Tooltip flotante de hover (desktop) — máximo 2 líneas, sin IDs técnicos.
 */

"use client";

import { splitZoneLabel } from "@/widgets/body-3d/ux/bodyUxCopy";

type BodyHoverTooltipProps = {
  atomicZoneId: string | null;
  pointer: { x: number; y: number } | null;
  visible: boolean;
};

export function BodyHoverTooltip({
  atomicZoneId,
  pointer,
  visible,
}: BodyHoverTooltipProps) {
  if (!visible || !atomicZoneId || !pointer) return null;

  const parts = splitZoneLabel(atomicZoneId);
  const left = Math.min(
    typeof window !== "undefined" ? window.innerWidth - 180 : pointer.x + 16,
    pointer.x + 16,
  );
  const top = Math.max(12, pointer.y - 52);

  return (
    <div
      role="tooltip"
      aria-hidden
      className="pointer-events-none fixed z-40 max-w-[12rem] rounded-xl border border-white/12 bg-[rgba(23,17,13,0.92)] px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md"
      style={{ left, top }}
    >
      {parts.detail ? (
        <>
          <p className="truncate text-[13px] font-semibold leading-tight text-[rgba(255,240,220,0.96)]">
            {parts.region}
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-[rgba(212,160,102,0.88)]">
            {parts.detail}
          </p>
        </>
      ) : (
        <p className="truncate text-[13px] font-semibold leading-tight text-[rgba(255,240,220,0.96)]">
          {parts.full}
        </p>
      )}
    </div>
  );
}
