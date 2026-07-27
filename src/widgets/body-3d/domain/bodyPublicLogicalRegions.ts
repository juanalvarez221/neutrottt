/**
 * Logical public body regions: one public target may hit multiple categorical
 * visual mask IDs while owning an independent Geometry Field.
 *
 * Categorical mask = functional hit authority.
 * Geometry Field = visual authority (never compose upper+lower fields for full_back).
 */

export type PublicBodyRegionId = string;
export type VisualBodyRegionId = string;

export interface LogicalPublicBodyRegion {
  regionId: PublicBodyRegionId;
  hitVisualRegionIds: readonly VisualBodyRegionId[];
}

/** Official logical unions. Extend here — do not hardcode in the highlight shader. */
export const LOGICAL_PUBLIC_BODY_REGIONS: readonly LogicalPublicBodyRegion[] = [
  {
    regionId: "full_back",
    hitVisualRegionIds: ["upper_back_surface", "lower_back_surface"],
  },
  {
    regionId: "full_neck",
    hitVisualRegionIds: [
      "neck_front_surface",
      "neck_right_surface",
      "neck_back_surface",
      "neck_left_surface",
    ],
  },
  {
    regionId: "right_upper_arm",
    hitVisualRegionIds: ["right_biceps_surface", "right_triceps_surface"],
  },
  {
    regionId: "left_upper_arm",
    hitVisualRegionIds: ["left_biceps_surface", "left_triceps_surface"],
  },
  {
    regionId: "right_forearm",
    hitVisualRegionIds: [
      "right_forearm_inner_surface",
      "right_forearm_outer_surface",
    ],
  },
  {
    regionId: "left_forearm",
    hitVisualRegionIds: [
      "left_forearm_inner_surface",
      "left_forearm_outer_surface",
    ],
  },
] as const;

const BY_REGION = new Map(
  LOGICAL_PUBLIC_BODY_REGIONS.map((e) => [e.regionId, e] as const),
);

const VISUAL_TO_LOGICAL = (() => {
  const map = new Map<string, LogicalPublicBodyRegion>();
  for (const entry of LOGICAL_PUBLIC_BODY_REGIONS) {
    for (const visual of entry.hitVisualRegionIds) {
      map.set(visual, entry);
    }
  }
  return map;
})();

export function getLogicalPublicBodyRegion(
  regionId: string,
): LogicalPublicBodyRegion | null {
  return BY_REGION.get(regionId) ?? null;
}

export function getLogicalRegionForVisualHit(
  visualRegionId: string,
): LogicalPublicBodyRegion | null {
  return VISUAL_TO_LOGICAL.get(visualRegionId) ?? null;
}

/**
 * When the active selection includes a logical target, normalize a categorical
 * hit on one of its visual IDs back to that public regionId.
 */
export function normalizeLogicalPublicHit(
  visualRegionId: string | null | undefined,
  activePublicTargetIds: readonly string[] = [],
): string | null {
  if (!visualRegionId) return null;
  const logical = VISUAL_TO_LOGICAL.get(visualRegionId);
  if (!logical) return visualRegionId;
  if (activePublicTargetIds.includes(logical.regionId)) {
    return logical.regionId;
  }
  return visualRegionId;
}

/**
 * Prefer an independent Geometry Field for a logical union when all of its
 * hit visuals are present in the highlight set.
 */
export function resolveGeometryFieldCandidateIds(
  highlightRegionIds: readonly string[],
): string[] {
  const set = new Set(highlightRegionIds);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const logical of LOGICAL_PUBLIC_BODY_REGIONS) {
    if (logical.hitVisualRegionIds.every((id) => set.has(id))) {
      if (!seen.has(logical.regionId)) {
        seen.add(logical.regionId);
        out.push(logical.regionId);
      }
    }
  }

  for (const id of highlightRegionIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Visual mask IDs that the categorical LUT must suppress while a field is active. */
export function visualIdsSuppressedByFieldRegion(
  fieldRegionId: string | null,
): readonly string[] {
  if (!fieldRegionId) return [];
  const logical = BY_REGION.get(fieldRegionId);
  if (logical) return logical.hitVisualRegionIds;
  return [fieldRegionId];
}

export function isLogicalPublicBodyRegionId(id: string): boolean {
  return BY_REGION.has(id);
}
