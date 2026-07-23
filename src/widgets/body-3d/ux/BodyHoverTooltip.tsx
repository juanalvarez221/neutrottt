/**
 * Tooltip flotante de hover (desktop) — shortLabel público + placement inteligente.
 */

"use client";

import { useMemo } from "react";
import { getPrimaryPublicSelectionTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { getPublicShortLabel } from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { placeHoverTooltip } from "@/widgets/body-3d/ux/bodySelectorLayout";

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
  const placement = useMemo(() => {
    if (!pointer || typeof window === "undefined") return null;
    return placeHoverTooltip(
      pointer.x,
      pointer.y,
      window.innerWidth,
      window.innerHeight,
    );
  }, [pointer]);

  if (!visible || !atomicZoneId || !pointer || !placement) return null;

  const primary =
    getPrimaryPublicSelectionTarget(atomicZoneId) ?? atomicZoneId;
  const label = getPublicShortLabel(primary);

  return (
    <div
      role="tooltip"
      aria-hidden
      className="pointer-events-none fixed z-40 max-w-[11rem] rounded-lg border border-white/12 bg-[rgba(23,17,13,0.92)] px-2.5 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md"
      style={{ left: placement.left, top: placement.top }}
    >
      <p className="truncate text-[12px] font-semibold leading-tight tracking-tight text-[rgba(255,240,220,0.96)]">
        {label}
      </p>
    </div>
  );
}
