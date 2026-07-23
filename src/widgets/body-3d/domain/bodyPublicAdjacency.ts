/**
 * Adjacency + contiguous selection for public body regions.
 * Graph generated from shared boundary edges on the BodyVisual source mesh.
 */

import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
import adjacencyData from "@/widgets/body-3d/domain/generated/publicRegionAdjacency.json";
import { resolvePublicTargetHighlightRegions } from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import type { SelectionTargetId } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
import { normalizeSelectedTargetIds } from "@/widgets/body-3d/interaction/bodySelectionEngine";

export type PublicBaseRegionId = string;

type AdjacencyFile = {
  adjacency: Record<string, string[]>;
  edgeCount: number;
  baseRegions: string[];
  routingOnlyRegions: string[];
};

const DATA = adjacencyData as AdjacencyFile;

/** Base-region adjacency (includes routing-only bridges). */
export const PUBLIC_REGION_ADJACENCY: Readonly<
  Record<string, readonly string[]>
> = DATA.adjacency;

export const PUBLIC_REGION_ADJACENCY_EDGE_COUNT = DATA.edgeCount;

const ROUTING_ONLY = new Set(DATA.routingOnlyRegions ?? []);

function areBaseRegionsAdjacent(a: string, b: string): boolean {
  if (a === b) return true;
  const na = PUBLIC_REGION_ADJACENCY[a];
  if (na?.includes(b)) return true;
  // One-hop through routing-only bridge (elbow/knee/…)
  for (const mid of na ?? []) {
    if (!ROUTING_ONLY.has(mid)) continue;
    if (PUBLIC_REGION_ADJACENCY[mid]?.includes(b)) return true;
  }
  return false;
}

/** True if two public targets share a base region or an adjacent boundary. */
export function arePublicTargetsAdjacent(
  a: string,
  b: string,
): boolean {
  const ra = resolvePublicTargetHighlightRegions(a);
  const rb = resolvePublicTargetHighlightRegions(b);
  if (ra.length === 0 || rb.length === 0) return false;
  for (const x of ra) {
    for (const y of rb) {
      if (areBaseRegionsAdjacent(x, y)) return true;
    }
  }
  return false;
}

/**
 * Selection is contiguous when every target shares adjacency (directly or via
 * routing bridges) with at least one other — i.e. one connected component.
 */
export function isConnectedBodySelection(
  targetIds: readonly string[],
): boolean {
  return isPublicSelectionContiguous(targetIds);
}

export function isPublicSelectionContiguous(
  targetIds: readonly string[],
): boolean {
  if (targetIds.length <= 1) return true;
  const ids = [...new Set(targetIds)];
  const visited = new Set<string>([ids[0]!]);
  const queue = [ids[0]!];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const other of ids) {
      if (visited.has(other)) continue;
      if (arePublicTargetsAdjacent(cur, other)) {
        visited.add(other);
        queue.push(other);
      }
    }
  }
  return visited.size === ids.length;
}

export type ContiguousAddResult =
  | { ok: true; next: SelectionTargetId[] }
  | {
      ok: false;
      reason: "distant";
      message: string;
      candidate: SelectionTargetId;
    };

/**
 * Try to add a target only if the resulting set stays contiguous.
 * Does not offer “add anyway”.
 */
export function tryAddContiguousPublicTarget(
  current: readonly SelectionTargetId[],
  candidate: SelectionTargetId,
): ContiguousAddResult {
  if (current.length === 0) {
    return {
      ok: true,
      next: normalizeConnectedBodySelection([candidate]),
    };
  }
  const trial = normalizeConnectedBodySelection([...current, candidate]);
  if (isPublicSelectionContiguous(trial)) {
    return { ok: true, next: trial };
  }
  return {
    ok: false,
    reason: "distant",
    message: "Esta zona está separada de tu selección actual.",
    candidate,
  };
}

/**
 * Normalize connected selections into preferred commercial groups when possible.
 */
export function normalizeConnectedBodySelection(
  targetIds: readonly SelectionTargetId[],
): SelectionTargetId[] {
  let next = normalizeSelectedTargetIds(targetIds);

  const has = (id: string) => next.includes(id);
  const without = (...ids: string[]) =>
    next.filter((t) => !ids.includes(t));

  // Full chest
  if (has("left_chest") && has("right_chest")) {
    next = [...without("left_chest", "right_chest"), "full_chest"];
  }

  // Full back
  if (has("upper_back_large") && has("lower_back_large")) {
    next = [...without("upper_back_large", "lower_back_large"), "full_back"];
  }

  // Upper arm complete
  for (const side of ["right", "left"] as const) {
    const bi = `${side}_biceps_region`;
    const tri = `${side}_triceps_region`;
    const full = `${side}_upper_arm`;
    if (has(bi) && has(tri)) {
      next = [...without(bi, tri), full];
    }
  }

  // Forearm complete
  for (const side of ["right", "left"] as const) {
    const inn = `${side}_forearm_inner_region`;
    const out = `${side}_forearm_outer_region`;
    const full = `${side}_forearm`;
    if (has(inn) && has(out)) {
      next = [...without(inn, out), full];
    }
  }

  // Lower leg complete
  for (const side of ["right", "left"] as const) {
    const shin = `${side}_lower_leg_front`;
    const calf = `${side}_lower_leg_back`;
    const full = `${side}_lower_leg`;
    if (has(shin) && has(calf)) {
      next = [...without(shin, calf), full];
    }
  }

  // Full sleeve promotion when upper + forearm (+ bridges) on same side
  for (const side of ["right", "left"] as const) {
    const upper = `${side}_upper_arm`;
    const forearm = `${side}_forearm`;
    const sleeve = `${side}_full_sleeve`;
    const bi = `${side}_biceps_region`;
    const tri = `${side}_triceps_region`;
    const inn = `${side}_forearm_inner_region`;
    const out = `${side}_forearm_outer_region`;
    const hasUpper = has(upper) || (has(bi) && has(tri));
    const hasFore = has(forearm) || (has(inn) && has(out));
    if (hasUpper && hasFore) {
      next = [
        ...without(upper, forearm, bi, tri, inn, out, `${side}_shoulder`),
        sleeve,
      ];
    }
  }

  // Full leg when thigh + lower leg
  for (const side of ["right", "left"] as const) {
    const thigh = `${side}_thigh`;
    const lower = `${side}_lower_leg`;
    const full = `${side}_full_leg`;
    if (has(thigh) && has(lower)) {
      next = [...without(thigh, lower), full];
    }
  }

  return normalizeSelectedTargetIds([...new Set(next)]);
}

export function filterContextualOptionsToContiguous(
  options: readonly ContextualSelectionOption[],
  selectedTargetIds: readonly string[],
): ContextualSelectionOption[] {
  if (selectedTargetIds.length === 0) return [...options];
  return options.filter((o) => {
    const trial = [...selectedTargetIds, o.targetId];
    return isPublicSelectionContiguous(trial);
  });
}

/** Lab / tests: expose raw adjacency neighbors. */
export function getAdjacentPublicBaseRegions(
  regionId: string,
): readonly string[] {
  return PUBLIC_REGION_ADJACENCY[regionId] ?? [];
}

export function listPublicBaseRegionsWithHighlights(): readonly string[] {
  return DATA.baseRegions ?? [];
}
