import type {
  AtomicBodyZoneDefinition,
  BodyZoneDefinition,
  BodyZoneGroupDefinition,
  BodyZoneHierarchy,
  ParentBodyZoneDefinition,
} from "@/widgets/body-3d/domain/bodyZoneTypes";

type Side = "left" | "right";
type Quad = "front" | "back" | "inner" | "outer";

const SIDE_LABEL: Record<Side, string> = {
  right: "derecho",
  left: "izquierdo",
};

const QUAD_LABEL: Record<Quad, string> = {
  front: "frente",
  back: "espalda",
  inner: "interior",
  outer: "exterior",
};

function atomicJoint(
  side: Side,
  part: "shoulder" | "elbow" | "wrist" | "hand",
  label: string,
  region: "arms" | "hands",
): AtomicBodyZoneDefinition {
  const id = `${side}_${part}`;
  return {
    id,
    label,
    region,
    side,
    kind: "atomic",
    interactionMeshName: `zone_${id}`,
  };
}

function atomicQuad(
  side: Side,
  segment: "upper_arm" | "forearm",
  quad: Quad,
): AtomicBodyZoneDefinition {
  const parentId = `${side}_${segment}`;
  const id = `${parentId}_${quad}`;
  const segLabel =
    segment === "upper_arm" ? "Brazo superior" : "Antebrazo";
  return {
    id,
    label: `${segLabel} ${SIDE_LABEL[side]} — ${QUAD_LABEL[quad]}`,
    region: "arms",
    side,
    kind: "atomic",
    interactionMeshName: `zone_${id}`,
    parentId,
  };
}

function parentSegment(
  side: Side,
  segment: "upper_arm" | "forearm",
  childIds: readonly string[],
): ParentBodyZoneDefinition {
  const id = `${side}_${segment}`;
  const segLabel =
    segment === "upper_arm" ? "Brazo superior" : "Antebrazo";
  return {
    id,
    label: `${segLabel} ${SIDE_LABEL[side]}`,
    region: "arms",
    side,
    kind: "parent",
    childIds,
  };
}

const QUADS: readonly Quad[] = ["front", "back", "inner", "outer"];

function buildSide(side: Side) {
  const shoulder = atomicJoint(
    side,
    "shoulder",
    `Hombro ${SIDE_LABEL[side]}`,
    "arms",
  );
  const elbow = atomicJoint(side, "elbow", `Codo ${SIDE_LABEL[side]}`, "arms");
  const wrist = atomicJoint(
    side,
    "wrist",
    `Muñeca ${SIDE_LABEL[side]}`,
    "arms",
  );
  const hand = atomicJoint(side, "hand", `Mano ${SIDE_LABEL[side]}`, "hands");

  const upperQuads = QUADS.map((q) => atomicQuad(side, "upper_arm", q));
  const forearmQuads = QUADS.map((q) => atomicQuad(side, "forearm", q));

  const upperParent = parentSegment(
    side,
    "upper_arm",
    upperQuads.map((z) => z.id),
  );
  const forearmParent = parentSegment(
    side,
    "forearm",
    forearmQuads.map((z) => z.id),
  );

  const atomics: AtomicBodyZoneDefinition[] = [
    shoulder,
    ...upperQuads,
    elbow,
    ...forearmQuads,
    wrist,
    hand,
  ];

  const hierarchy: BodyZoneHierarchy[] = [
    { parentId: upperParent.id, childIds: upperParent.childIds },
    { parentId: forearmParent.id, childIds: forearmParent.childIds },
  ];

  const fullArm: BodyZoneGroupDefinition = {
    id: `${side}_full_arm`,
    label: `Brazo ${SIDE_LABEL[side]} completo`,
    zoneIds: [
      shoulder.id,
      upperParent.id,
      elbow.id,
      forearmParent.id,
      wrist.id,
      hand.id,
    ],
  };

  return {
    atomics,
    parents: [upperParent, forearmParent] as ParentBodyZoneDefinition[],
    hierarchy,
    fullArm,
  };
}

const RIGHT = buildSide("right");
const LEFT = buildSide("left");

/** 24 zonas atómicas seleccionables (12 por brazo). */
export const ATOMIC_ARM_ZONES: readonly AtomicBodyZoneDefinition[] = [
  ...RIGHT.atomics,
  ...LEFT.atomics,
] as const;

/** Parents lógicos (sin mesh en el InteractionModel detallado). */
export const PARENT_ARM_ZONES: readonly ParentBodyZoneDefinition[] = [
  ...RIGHT.parents,
  ...LEFT.parents,
] as const;

export const ALL_BODY_ZONES: readonly BodyZoneDefinition[] = [
  ...ATOMIC_ARM_ZONES,
  ...PARENT_ARM_ZONES,
] as const;

export const BODY_ZONES_BY_ID: Readonly<Record<string, BodyZoneDefinition>> =
  Object.fromEntries(ALL_BODY_ZONES.map((z) => [z.id, z]));

export const ARM_ZONE_HIERARCHIES: readonly BodyZoneHierarchy[] = [
  ...RIGHT.hierarchy,
  ...LEFT.hierarchy,
] as const;

export const RIGHT_FULL_ARM_GROUP = RIGHT.fullArm;
export const LEFT_FULL_ARM_GROUP = LEFT.fullArm;

export const BOTH_ARMS_GROUP: BodyZoneGroupDefinition = {
  id: "both_arms",
  label: "Ambos brazos",
  zoneIds: [RIGHT_FULL_ARM_GROUP.id, LEFT_FULL_ARM_GROUP.id],
};

export const ARM_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  RIGHT_FULL_ARM_GROUP,
  LEFT_FULL_ARM_GROUP,
  BOTH_ARMS_GROUP,
] as const;

export const BODY_ZONE_GROUPS_BY_ID: Readonly<
  Record<string, BodyZoneGroupDefinition>
> = Object.fromEntries(ARM_ZONE_GROUPS.map((g) => [g.id, g]));

export function getBodyZone(id: string): BodyZoneDefinition | undefined {
  return BODY_ZONES_BY_ID[id];
}

export function getBodyZoneGroup(
  id: string,
): BodyZoneGroupDefinition | undefined {
  return BODY_ZONE_GROUPS_BY_ID[id];
}

/** InteractionModel bilateral oficial (24 meshes). */
export const DETAILED_ARMS_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_detailed_arms_interaction.glb";

/** Legacy longitudinal R2 (6 meshes derecho) — referencia. */
export const RIGHT_ARM_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_right_arm_interaction.glb";

export type ArmDebugVisibility = "right" | "left" | "both";

/** @deprecated aliases conservados para código experimental previo */
export const PILOT_BODY_ZONES = PARENT_ARM_ZONES.filter((z) =>
  z.id.startsWith("right_"),
);
export const CIRCUMFERENTIAL_EXPERIMENTAL_ZONES = ATOMIC_ARM_ZONES.filter((z) =>
  z.id.includes("upper_arm_") || z.id.includes("forearm_"),
);
export const PILOT_BODY_ZONE_GROUPS = [RIGHT_FULL_ARM_GROUP] as const;
export const EXPERIMENTAL_ZONE_HIERARCHIES = RIGHT.hierarchy;
