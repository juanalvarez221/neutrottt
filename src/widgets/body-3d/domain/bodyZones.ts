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

function torsoAtomic(
  id: string,
  label: string,
  side: "left" | "right" | "center" = "center",
): AtomicBodyZoneDefinition {
  return {
    id,
    label,
    region: "torso",
    side,
    kind: "atomic",
    interactionMeshName: `zone_${id}`,
  };
}

/** 18 zonas atómicas del torso (T1/T2 pilotos). */
export const ATOMIC_TORSO_ZONES: readonly AtomicBodyZoneDefinition[] = [
  torsoAtomic("left_chest", "Pecho izquierdo", "left"),
  torsoAtomic("right_chest", "Pecho derecho", "right"),
  torsoAtomic("sternum", "Esternón", "center"),
  torsoAtomic("upper_abdomen", "Abdomen superior", "center"),
  torsoAtomic("lower_abdomen", "Abdomen inferior", "center"),
  torsoAtomic("left_ribs", "Costillas izquierdas", "left"),
  torsoAtomic("right_ribs", "Costillas derechas", "right"),
  torsoAtomic("left_flank", "Costado izquierdo", "left"),
  torsoAtomic("right_flank", "Costado derecho", "right"),
  torsoAtomic("left_scapula", "Omóplato izquierdo", "left"),
  torsoAtomic("right_scapula", "Omóplato derecho", "right"),
  torsoAtomic("upper_back_center", "Espalda superior central", "center"),
  torsoAtomic("left_mid_back", "Espalda media izquierda", "left"),
  torsoAtomic("right_mid_back", "Espalda media derecha", "right"),
  torsoAtomic("mid_back_center", "Espalda media central", "center"),
  torsoAtomic("left_lower_back", "Espalda baja izquierda", "left"),
  torsoAtomic("right_lower_back", "Espalda baja derecha", "right"),
  torsoAtomic("lower_back_center", "Espalda baja central", "center"),
] as const;

export const ALL_BODY_ZONES: readonly BodyZoneDefinition[] = [
  ...ATOMIC_ARM_ZONES,
  ...PARENT_ARM_ZONES,
  ...ATOMIC_TORSO_ZONES,
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

export const FULL_CHEST_GROUP: BodyZoneGroupDefinition = {
  id: "full_chest",
  label: "Pecho completo",
  zoneIds: ["left_chest", "right_chest", "sternum"],
};

export const FULL_ABDOMEN_GROUP: BodyZoneGroupDefinition = {
  id: "full_abdomen",
  label: "Abdomen completo",
  zoneIds: ["upper_abdomen", "lower_abdomen"],
};

export const FULL_RIBS_GROUP: BodyZoneGroupDefinition = {
  id: "full_ribs",
  label: "Costillas",
  zoneIds: ["left_ribs", "right_ribs"],
};

export const FULL_FLANKS_GROUP: BodyZoneGroupDefinition = {
  id: "full_flanks",
  label: "Costados",
  zoneIds: ["left_flank", "right_flank"],
};

export const UPPER_BACK_GROUP: BodyZoneGroupDefinition = {
  id: "upper_back",
  label: "Espalda superior",
  zoneIds: ["left_scapula", "right_scapula", "upper_back_center"],
};

export const MID_BACK_GROUP: BodyZoneGroupDefinition = {
  id: "mid_back",
  label: "Espalda media",
  zoneIds: ["left_mid_back", "right_mid_back", "mid_back_center"],
};

export const LOWER_BACK_GROUP: BodyZoneGroupDefinition = {
  id: "lower_back",
  label: "Espalda baja",
  zoneIds: ["left_lower_back", "right_lower_back", "lower_back_center"],
};

export const FRONT_TORSO_GROUP: BodyZoneGroupDefinition = {
  id: "front_torso",
  label: "Torso frontal",
  zoneIds: [
    FULL_CHEST_GROUP.id,
    FULL_ABDOMEN_GROUP.id,
    FULL_RIBS_GROUP.id,
    FULL_FLANKS_GROUP.id,
  ],
};

export const BACK_TORSO_GROUP: BodyZoneGroupDefinition = {
  id: "back_torso",
  label: "Torso posterior",
  zoneIds: [UPPER_BACK_GROUP.id, MID_BACK_GROUP.id, LOWER_BACK_GROUP.id],
};

export const FULL_TORSO_GROUP: BodyZoneGroupDefinition = {
  id: "full_torso",
  label: "Torso completo",
  zoneIds: [FRONT_TORSO_GROUP.id, BACK_TORSO_GROUP.id],
};

export const ARM_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  RIGHT_FULL_ARM_GROUP,
  LEFT_FULL_ARM_GROUP,
  BOTH_ARMS_GROUP,
] as const;

export const TORSO_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  FULL_CHEST_GROUP,
  FULL_ABDOMEN_GROUP,
  FULL_RIBS_GROUP,
  FULL_FLANKS_GROUP,
  UPPER_BACK_GROUP,
  MID_BACK_GROUP,
  LOWER_BACK_GROUP,
  FRONT_TORSO_GROUP,
  BACK_TORSO_GROUP,
  FULL_TORSO_GROUP,
] as const;

export const ALL_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  ...ARM_ZONE_GROUPS,
  ...TORSO_ZONE_GROUPS,
] as const;

export const BODY_ZONE_GROUPS_BY_ID: Readonly<
  Record<string, BodyZoneGroupDefinition>
> = Object.fromEntries(ALL_ZONE_GROUPS.map((g) => [g.id, g]));

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

/** Pilotos de torso (18 meshes cada uno). */
export const TORSO_T1_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_torso_t1.glb";
export const TORSO_T2_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_torso_t2.glb";

/** Legacy longitudinal R2 (6 meshes derecho) — referencia. */
export const RIGHT_ARM_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_right_arm_interaction.glb";

export type ArmDebugVisibility = "right" | "left" | "both";

export type InteractionDebugLayer =
  | "arms"
  | "torso_t1"
  | "torso_t2"
  | "arms_and_torso_t2";

export function interactionModelSrcForLayer(
  layer: InteractionDebugLayer,
): string {
  if (layer === "torso_t1") return TORSO_T1_INTERACTION_MODEL_SRC;
  if (layer === "torso_t2" || layer === "arms_and_torso_t2") {
    return TORSO_T2_INTERACTION_MODEL_SRC;
  }
  return DETAILED_ARMS_INTERACTION_MODEL_SRC;
}

/** @deprecated aliases conservados para código experimental previo */
export const PILOT_BODY_ZONES = PARENT_ARM_ZONES.filter((z) =>
  z.id.startsWith("right_"),
);
export const CIRCUMFERENTIAL_EXPERIMENTAL_ZONES = ATOMIC_ARM_ZONES.filter((z) =>
  z.id.includes("upper_arm_") || z.id.includes("forearm_"),
);
export const PILOT_BODY_ZONE_GROUPS = [RIGHT_FULL_ARM_GROUP] as const;
export const EXPERIMENTAL_ZONE_HIERARCHIES = RIGHT.hierarchy;
