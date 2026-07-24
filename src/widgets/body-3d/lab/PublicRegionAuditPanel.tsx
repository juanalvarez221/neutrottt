/**
 * Lab-only audit panel for PublicRegionHighlightModel.
 * Not shown in production quote flow.
 */

"use client";

import { useMemo, useState } from "react";
import {
  getAdjacentPublicBaseRegions,
  PUBLIC_REGION_ADJACENCY_EDGE_COUNT,
} from "@/widgets/body-3d/domain/bodyPublicAdjacency";
import {
  MODEL_BACK,
  MODEL_FORWARD,
  MODEL_LEFT,
  MODEL_RIGHT,
  viewHemisphereScore,
} from "@/widgets/body-3d/domain/bodyModelCoordinateSystem";
import {
  PUBLIC_HIGHLIGHT_REGION_IDS,
  resolvePublicTargetHighlightRegions,
  type PublicHighlightRegionId,
} from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  getPublicDescription,
  getPublicShortLabel,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { PUBLIC_SELECTABLE_BODY_TARGET_IDS } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  getCameraPoseForPublicTarget,
  getFramingScale,
  getPreferredFocusSection,
  preferredViewToCanonical,
  toCardinalCameraView,
  getPreferredBodyView,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";
import adjacencyData from "@/widgets/body-3d/domain/generated/publicRegionAdjacency.json";
import { NEUTRO_BODY_V1_MODEL } from "@/widgets/body-3d/bodyModelDefinition";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

type StatsEntry = {
  faceCount?: number;
  surfaceArea?: number;
  centroid?: number[];
  connectedComponents?: number;
};

const STATS = (adjacencyData as { stats?: Record<string, StatsEntry> }).stats ?? {};

const TARGET_IDS = [...PUBLIC_SELECTABLE_BODY_TARGET_IDS].sort();

export function PublicRegionAuditPanel({
  selectedTargetId,
  onSelectTarget,
  highlightedRegions,
  onCameraViewChange,
}: {
  selectedTargetId: string | null;
  onSelectTarget: (id: string) => void;
  highlightedRegions: readonly PublicHighlightRegionId[];
  onCameraViewChange?: (view: BodyCameraView) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TARGET_IDS;
    return TARGET_IDS.filter(
      (id) =>
        id.includes(q) || getPublicShortLabel(id).toLowerCase().includes(q),
    );
  }, [query]);

  const regions = selectedTargetId
    ? resolvePublicTargetHighlightRegions(selectedTargetId)
    : highlightedRegions;

  const regionStats = regions.map((rid) => ({
    id: rid,
    ...(STATS[rid] ?? {}),
    adjacent: getAdjacentPublicBaseRegions(rid),
  }));

  const cameraAudit = useMemo(() => {
    if (!selectedTargetId) return null;
    const preferred = getPreferredBodyView(selectedTargetId);
    const pose = getCameraPoseForPublicTarget(
      selectedTargetId,
      NEUTRO_BODY_V1_MODEL.camera,
    );
    const axes = {
      front: viewHemisphereScore(pose.position, pose.target, MODEL_FORWARD),
      back: viewHemisphereScore(pose.position, pose.target, MODEL_BACK),
      left: viewHemisphereScore(pose.position, pose.target, MODEL_LEFT),
      right: viewHemisphereScore(pose.position, pose.target, MODEL_RIGHT),
    };
    const dominant = (
      Object.entries(axes) as Array<[keyof typeof axes, number]>
    ).sort((a, b) => b[1] - a[1])[0]!;
    return {
      preferred,
      canonical: preferredViewToCanonical(preferred),
      cardinal: toCardinalCameraView(preferred),
      actualHemisphere: dominant[0],
      scores: axes,
      position: pose.position.toArray().map((n) => Number(n.toFixed(3))),
    };
  }, [selectedTargetId]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Anatomical Region Review
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Public Anatomy QA · debug-only · adjacency:{" "}
        {PUBLIC_REGION_ADJACENCY_EDGE_COUNT} · meshes:{" "}
        {PUBLIC_HIGHLIGHT_REGION_IDS.length}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["front", "Front"],
            ["back", "Back"],
            ["left", "Left"],
            ["right", "Right"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onCameraViewChange?.(id)}
            className="rounded-md border border-white/10 bg-black/35 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300 transition hover:border-[rgba(232,168,64,0.35)] hover:text-[rgba(255,230,200,0.95)] active:scale-[0.98]"
          >
            {label}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Target público
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar…"
          className="mb-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[rgba(232,168,64,0.4)]"
        />
        <select
          value={selectedTargetId ?? ""}
          onChange={(e) => onSelectTarget(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[rgba(232,168,64,0.4)]"
        >
          <option value="">— elegir —</option>
          {filtered.map((id) => (
            <option key={id} value={id}>
              {getPublicShortLabel(id)} ({id})
            </option>
          ))}
        </select>
      </label>

      {selectedTargetId ? (
        <div className="mt-4 space-y-3 border-t border-white/8 pt-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Target
            </p>
            <p className="mt-1 font-mono text-xs text-[rgba(255,230,200,0.9)]">
              {selectedTargetId}
            </p>
            <p className="mt-1 font-semibold text-[rgba(255,242,228,0.95)]">
              {getPublicShortLabel(selectedTargetId)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {getPublicDescription(selectedTargetId)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/8 bg-black/30 p-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                preferredView
              </p>
              <p className="mt-1 font-mono text-zinc-200">
                {cameraAudit?.preferred}
              </p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/30 p-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                focus / scale
              </p>
              <p className="mt-1 font-mono text-zinc-200">
                {getPreferredFocusSection(selectedTargetId)} ·{" "}
                {getFramingScale(selectedTargetId)}
              </p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/30 p-2 col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                camera actual orientation
              </p>
              <p className="mt-1 font-mono text-zinc-200">
                canonical={cameraAudit?.canonical} · hemisferio=
                {cameraAudit?.actualHemisphere} · cardinal=
                {cameraAudit?.cardinal}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                scores f/b/l/r=
                {cameraAudit
                  ? [
                      cameraAudit.scores.front,
                      cameraAudit.scores.back,
                      cameraAudit.scores.left,
                      cameraAudit.scores.right,
                    ]
                      .map((n) => n.toFixed(2))
                      .join(" / ")
                  : "—"}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                pos=[{cameraAudit?.position.join(", ")}]
              </p>
              <button
                type="button"
                className="mt-2 rounded-md border border-[rgba(232,168,64,0.35)] bg-[rgba(232,168,64,0.12)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(255,230,200,0.95)] active:scale-[0.98]"
                onClick={() => {
                  if (cameraAudit) onCameraViewChange?.(cameraAudit.cardinal);
                }}
              >
                Select target view
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Public highlight regions
            </p>
            <ul className="mt-2 space-y-2">
              {regionStats.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-white/8 bg-black/30 p-2 font-mono text-[11px] text-zinc-300"
                >
                  <p className="text-[rgba(232,168,64,0.9)]">{r.id}</p>
                  <p className="mt-1 text-zinc-500">
                    faces={r.faceCount ?? "—"} · area={r.surfaceArea ?? "—"} ·
                    comps={r.connectedComponents ?? "—"}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    centroid=
                    {r.centroid
                      ? `[${r.centroid.map((n) => n.toFixed(3)).join(", ")}]`
                      : "—"}
                  </p>
                  <p className="mt-1 break-all text-zinc-500">
                    adj: {(r.adjacent ?? []).join(", ") || "—"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-zinc-500">
          Elige un target para inspeccionar geometría, adyacencia y cámara.
        </p>
      )}
    </div>
  );
}
