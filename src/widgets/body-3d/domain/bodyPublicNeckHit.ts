/**
 * Hit preference for lateral neck quadrants.
 *
 * The categorical atlas paints laterals as thin bands (indices 7/8). Neighbor
 * meshes (anterior neck, nape, shoulders, scalp) often win the raycast.
 * Mask laterals stay authoritative; a lateral interaction mesh reclaims stolen
 * neighbor hits so both sides are selectable.
 */

export const LATERAL_NECK_PUBLIC_IDS = ["neck_left", "neck_right"] as const;

export type LateralNeckPublicId = (typeof LATERAL_NECK_PUBLIC_IDS)[number];

const LATERAL_NECK = new Set<string>(LATERAL_NECK_PUBLIC_IDS);

/** Public targets that frequently steal a lateral-neck ray. */
const LATERAL_NECK_STEALERS = new Set<string>([
  "neck_front",
  "neck_back",
  "full_neck",
  "right_shoulder",
  "left_shoulder",
  "head_left_region",
  "head_right_region",
  "head_top",
  "head_back",
  "full_scalp",
  "full_chest",
  "upper_back",
]);

export function isLateralNeckPublicId(id: string | null | undefined): boolean {
  return Boolean(id && LATERAL_NECK.has(id));
}

/**
 * Resolve the public target for a neck-side hit.
 * Mask laterals win. A lateral atomic reclaims stolen neighbors.
 */
export function resolveLateralNeckPublicHit(
  atomicId: string | null | undefined,
  maskPublicTargetId: string | null | undefined,
): string | null {
  if (maskPublicTargetId && LATERAL_NECK.has(maskPublicTargetId)) {
    return maskPublicTargetId;
  }
  if (atomicId && LATERAL_NECK.has(atomicId)) {
    if (!maskPublicTargetId || LATERAL_NECK_STEALERS.has(maskPublicTargetId)) {
      return atomicId;
    }
  }
  return maskPublicTargetId ?? null;
}
