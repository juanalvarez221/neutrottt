"use client";

import { useState } from "react";
import { REGION_LABELS, REGION_TO_ZONE } from "./svgRegionsMap";

type RegionShape =
  | { id: string; t: "e"; cx: number; cy: number; rx: number; ry: number }
  | {
      id: string;
      t: "r";
      x: number;
      y: number;
      w: number;
      h: number;
      rx: number;
      rot?: [number, number, number];
    };

type RegionState = "idle" | "hover" | "active" | "partial" | "disabled";

const VIEW = "0 0 240 520";

const FRONT_REGIONS: RegionShape[] = [
  { id: "zone-head-front", t: "e", cx: 120, cy: 42, rx: 30, ry: 36 },
  { id: "zone-neck-front", t: "r", x: 108, y: 74, w: 24, h: 22, rx: 7 },
  { id: "zone-shoulder-left", t: "r", x: 60, y: 92, w: 46, h: 26, rx: 13 },
  { id: "zone-shoulder-right", t: "r", x: 134, y: 92, w: 46, h: 26, rx: 13 },
  { id: "zone-ribs-left", t: "r", x: 80, y: 118, w: 16, h: 64, rx: 8 },
  { id: "zone-ribs-right", t: "r", x: 144, y: 118, w: 16, h: 64, rx: 8 },
  { id: "zone-chest-left", t: "r", x: 90, y: 104, w: 28, h: 44, rx: 10 },
  { id: "zone-chest-right", t: "r", x: 122, y: 104, w: 28, h: 44, rx: 10 },
  { id: "zone-sternum", t: "r", x: 112, y: 108, w: 16, h: 42, rx: 7 },
  { id: "zone-abdomen-upper", t: "r", x: 96, y: 150, w: 48, h: 36, rx: 12 },
  { id: "zone-abdomen-lower", t: "r", x: 98, y: 188, w: 44, h: 38, rx: 14 },
  { id: "zone-bicep-left", t: "r", x: 54, y: 116, w: 26, h: 58, rx: 13, rot: [-8, 67, 145] },
  { id: "zone-bicep-right", t: "r", x: 160, y: 116, w: 26, h: 58, rx: 13, rot: [8, 173, 145] },
  { id: "zone-forearm-int-left", t: "r", x: 46, y: 176, w: 24, h: 60, rx: 12, rot: [-6, 58, 206] },
  { id: "zone-forearm-int-right", t: "r", x: 170, y: 176, w: 24, h: 60, rx: 12, rot: [6, 182, 206] },
  { id: "zone-hand-left", t: "r", x: 42, y: 238, w: 24, h: 30, rx: 10 },
  { id: "zone-hand-right", t: "r", x: 174, y: 238, w: 24, h: 30, rx: 10 },
  { id: "zone-quad-left", t: "r", x: 92, y: 238, w: 26, h: 92, rx: 13 },
  { id: "zone-quad-right", t: "r", x: 122, y: 238, w: 26, h: 92, rx: 13 },
  { id: "zone-knee-left", t: "r", x: 94, y: 332, w: 22, h: 24, rx: 10 },
  { id: "zone-knee-right", t: "r", x: 124, y: 332, w: 22, h: 24, rx: 10 },
  { id: "zone-shin-left", t: "r", x: 96, y: 358, w: 20, h: 96, rx: 9 },
  { id: "zone-shin-right", t: "r", x: 124, y: 358, w: 20, h: 96, rx: 9 },
  { id: "zone-foot-left", t: "r", x: 88, y: 456, w: 28, h: 28, rx: 10 },
  { id: "zone-foot-right", t: "r", x: 124, y: 456, w: 28, h: 28, rx: 10 },
];

const BACK_REGIONS: RegionShape[] = [
  { id: "zone-head-back", t: "e", cx: 120, cy: 42, rx: 30, ry: 36 },
  { id: "zone-neck-back", t: "r", x: 108, y: 74, w: 24, h: 22, rx: 7 },
  { id: "zone-trap-left", t: "r", x: 86, y: 92, w: 32, h: 28, rx: 10 },
  { id: "zone-trap-right", t: "r", x: 122, y: 92, w: 32, h: 28, rx: 10 },
  { id: "zone-ribs-left", t: "r", x: 80, y: 124, w: 14, h: 60, rx: 7 },
  { id: "zone-ribs-right", t: "r", x: 146, y: 124, w: 14, h: 60, rx: 7 },
  { id: "zone-upper-back", t: "r", x: 90, y: 118, w: 60, h: 44, rx: 12 },
  { id: "zone-mid-back", t: "r", x: 94, y: 162, w: 52, h: 40, rx: 12 },
  { id: "zone-lower-back", t: "r", x: 98, y: 202, w: 44, h: 36, rx: 14 },
  { id: "zone-tricep-left", t: "r", x: 54, y: 116, w: 26, h: 58, rx: 13, rot: [-8, 67, 145] },
  { id: "zone-tricep-right", t: "r", x: 160, y: 116, w: 26, h: 58, rx: 13, rot: [8, 173, 145] },
  { id: "zone-forearm-ext-left", t: "r", x: 46, y: 176, w: 24, h: 60, rx: 12, rot: [-6, 58, 206] },
  { id: "zone-forearm-ext-right", t: "r", x: 170, y: 176, w: 24, h: 60, rx: 12, rot: [6, 182, 206] },
  { id: "zone-glute-left", t: "r", x: 92, y: 238, w: 26, h: 40, rx: 14 },
  { id: "zone-glute-right", t: "r", x: 122, y: 238, w: 26, h: 40, rx: 14 },
  { id: "zone-hamstring-left", t: "r", x: 92, y: 280, w: 26, h: 74, rx: 13 },
  { id: "zone-hamstring-right", t: "r", x: 122, y: 280, w: 26, h: 74, rx: 13 },
  { id: "zone-calf-left", t: "r", x: 96, y: 356, w: 20, h: 96, rx: 10 },
  { id: "zone-calf-right", t: "r", x: 124, y: 356, w: 20, h: 96, rx: 10 },
  { id: "zone-foot-back-left", t: "r", x: 88, y: 456, w: 28, h: 28, rx: 10 },
  { id: "zone-foot-back-right", t: "r", x: 124, y: 456, w: 28, h: 28, rx: 10 },
];

const STATE_STYLE: Record<RegionState, { fill: string; stroke: string; opacity: number }> = {
  idle: { fill: "#2E2318", stroke: "#5C4A32", opacity: 1 },
  hover: { fill: "#3D3020", stroke: "#A07840", opacity: 1 },
  active: { fill: "#C9893A", stroke: "#E8A84E", opacity: 1 },
  partial: { fill: "#C9893A", stroke: "#E8A84E", opacity: 0.5 },
  disabled: { fill: "#2E2318", stroke: "#3D3020", opacity: 0.3 },
};

function resolveState(
  id: string,
  hoveredId: string | null,
  active: Set<string>,
  partial: Set<string>,
  dimUnrelated: boolean,
): RegionState {
  if (active.has(id)) return "active";
  if (hoveredId === id) return "hover";
  if (partial.has(id)) return "partial";
  if (dimUnrelated) return "disabled";
  return "idle";
}

function MannequinView({
  title,
  regions,
  active,
  partial,
  dimUnrelated,
  hoveredId,
  setHoveredId,
  onRegionClick,
  filterId,
}: {
  title: string;
  regions: RegionShape[];
  active: Set<string>;
  partial: Set<string>;
  dimUnrelated: boolean;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  onRegionClick: (zoneId: string) => void;
  filterId: string;
}) {
  const hoveredLabel = hoveredId ? REGION_LABELS[hoveredId] : null;

  return (
    <div className="rounded-2xl border border-[#5C4A32]/40 bg-[#241A0E] p-3">
      <div className="relative">
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 flex -translate-x-1/2 justify-center">
          {hoveredLabel ? (
            <span className="rounded-full border border-[#A07840]/40 bg-[#1C1410]/90 px-3 py-1 text-[11px] font-medium tracking-wide text-[#E8A84E] shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
              {hoveredLabel}
            </span>
          ) : null}
        </div>

        <svg
          viewBox={VIEW}
          className="mx-auto block h-auto w-full max-h-[min(58dvh,520px)]"
          role="img"
          aria-label={`Vista ${title} del cuerpo`}
        >
          <defs>
            <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.2" floodColor="#C9893A" floodOpacity="0.53" />
            </filter>
          </defs>

          {regions.map((shape) => {
            const state = resolveState(shape.id, hoveredId, active, partial, dimUnrelated);
            const style = STATE_STYLE[state];
            const zoneId = REGION_TO_ZONE[shape.id];
            const common = {
              fill: style.fill,
              stroke: style.stroke,
              strokeWidth: 1.5,
              opacity: style.opacity,
              filter: state === "active" ? `url(#${filterId})` : undefined,
              style: {
                cursor: zoneId ? "pointer" : "default",
                transition: "fill 200ms ease, stroke 200ms ease, opacity 200ms ease",
              } as const,
              onMouseEnter: () => setHoveredId(shape.id),
              onMouseLeave: () => setHoveredId(null),
              onClick: () => {
                if (zoneId) onRegionClick(zoneId);
              },
            };

            if (shape.t === "e") {
              return <ellipse key={shape.id} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />;
            }

            return (
              <rect
                key={shape.id}
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                rx={shape.rx}
                transform={shape.rot ? `rotate(${shape.rot[0]} ${shape.rot[1]} ${shape.rot[2]})` : undefined}
                {...common}
              />
            );
          })}
        </svg>
      </div>

      <span className="mt-2 block text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A07840]">
        {title}
      </span>
    </div>
  );
}

export function BodyMapSVG({
  activeRegions,
  partialRegions,
  dimUnrelated,
  onRegionClick,
}: {
  activeRegions: string[];
  partialRegions: string[];
  dimUnrelated: boolean;
  onRegionClick: (zoneId: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const active = new Set(activeRegions);
  const partial = new Set(partialRegions);

  return (
    <div className="grid grid-cols-2 gap-3">
      <MannequinView
        title="Frontal"
        regions={FRONT_REGIONS}
        active={active}
        partial={partial}
        dimUnrelated={dimUnrelated}
        hoveredId={hoveredId}
        setHoveredId={setHoveredId}
        onRegionClick={onRegionClick}
        filterId="zone-glow-front"
      />
      <MannequinView
        title="Posterior"
        regions={BACK_REGIONS}
        active={active}
        partial={partial}
        dimUnrelated={dimUnrelated}
        hoveredId={hoveredId}
        setHoveredId={setHoveredId}
        onRegionClick={onRegionClick}
        filterId="zone-glow-back"
      />
    </div>
  );
}
