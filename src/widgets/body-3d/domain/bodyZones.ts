import type {
  AtomicBodyZoneDefinition,
  BodyZoneDefinition,
  BodyZoneGroupDefinition,
  BodyZoneHierarchy,
  ParentBodyZoneDefinition,
} from "@/widgets/body-3d/domain/bodyZoneTypes";
import {
  isAtomicZone,
  isParentZone,
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

/** 18 zonas atómicas del torso (T2 oficial). */
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

function pelvisAtomic(
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

/** 5 zonas atómicas de pelvis / glúteos. */
export const ATOMIC_PELVIS_ZONES: readonly AtomicBodyZoneDefinition[] = [
  pelvisAtomic("left_hip", "Cadera izquierda", "left"),
  pelvisAtomic("right_hip", "Cadera derecha", "right"),
  pelvisAtomic("left_glute", "Glúteo izquierdo", "left"),
  pelvisAtomic("right_glute", "Glúteo derecho", "right"),
  pelvisAtomic("sacrum", "Sacro", "center"),
] as const;

function headAtomic(
  id: string,
  label: string,
  side: "left" | "right" | "center" = "center",
): AtomicBodyZoneDefinition {
  return {
    id,
    label,
    region: "head",
    side,
    kind: "atomic",
    interactionMeshName: `zone_${id}`,
  };
}

/** 12 zonas atómicas oficiales de cabeza / cuello / rostro / orejas. */
export const ATOMIC_HEAD_NECK_ZONES: readonly AtomicBodyZoneDefinition[] = [
  headAtomic("neck_front", "Cuello frente", "center"),
  headAtomic("neck_back", "Nuca", "center"),
  headAtomic("neck_left", "Cuello izquierdo", "left"),
  headAtomic("neck_right", "Cuello derecho", "right"),
  headAtomic("face_left", "Rostro izquierdo", "left"),
  headAtomic("face_right", "Rostro derecho", "right"),
  headAtomic("head_top", "Coronilla", "center"),
  headAtomic("head_back", "Cabeza posterior", "center"),
  headAtomic("head_left_side", "Cabeza lateral izquierda", "left"),
  headAtomic("head_right_side", "Cabeza lateral derecha", "right"),
  headAtomic("left_ear", "Oreja izquierda", "left"),
  headAtomic("right_ear", "Oreja derecha", "right"),
] as const;

export const FULL_NECK_GROUP: BodyZoneGroupDefinition = {
  id: "full_neck",
  label: "Cuello completo",
  zoneIds: ["neck_front", "neck_back", "neck_left", "neck_right"],
};

export const FULL_FACE_GROUP: BodyZoneGroupDefinition = {
  id: "full_face",
  label: "Rostro completo",
  zoneIds: ["face_left", "face_right"],
};

export const FULL_SCALP_GROUP: BodyZoneGroupDefinition = {
  id: "full_scalp",
  label: "Cuero cabelludo",
  zoneIds: [
    "head_top",
    "head_back",
    "head_left_side",
    "head_right_side",
  ],
};

export const BOTH_EARS_GROUP: BodyZoneGroupDefinition = {
  id: "both_ears",
  label: "Ambas orejas",
  zoneIds: ["left_ear", "right_ear"],
};

export const FULL_HEAD_GROUP: BodyZoneGroupDefinition = {
  id: "full_head",
  label: "Cabeza completa",
  zoneIds: [
    ...FULL_FACE_GROUP.zoneIds,
    ...FULL_SCALP_GROUP.zoneIds,
    ...BOTH_EARS_GROUP.zoneIds,
  ],
};

function legAtomic(
  id: string,
  label: string,
  side: "left" | "right",
): AtomicBodyZoneDefinition {
  return {
    id,
    label,
    region: "legs",
    side,
    kind: "atomic",
    interactionMeshName: `zone_${id}`,
  };
}

function legParent(
  id: string,
  label: string,
  side: "left" | "right",
  childIds: readonly string[],
): ParentBodyZoneDefinition {
  return {
    id,
    label,
    region: "legs",
    side,
    kind: "parent",
    childIds,
  };
}

/** 22 zonas atómicas oficiales de piernas (G2 + L2). */
export const ATOMIC_LEG_ZONES: readonly AtomicBodyZoneDefinition[] = [
  legAtomic("right_thigh_front", "Muslo derecho frente", "right"),
  legAtomic("right_thigh_back", "Muslo derecho espalda", "right"),
  legAtomic("right_thigh_inner", "Muslo derecho interior", "right"),
  legAtomic("right_thigh_outer", "Muslo derecho exterior", "right"),
  legAtomic("right_knee", "Rodilla derecha", "right"),
  legAtomic("right_lower_leg_front", "Pierna derecha frente", "right"),
  legAtomic("right_lower_leg_back", "Pierna derecha espalda", "right"),
  legAtomic("right_lower_leg_inner", "Pierna derecha interior", "right"),
  legAtomic("right_lower_leg_outer", "Pierna derecha exterior", "right"),
  legAtomic("right_ankle", "Tobillo derecho", "right"),
  legAtomic("right_foot", "Pie derecho", "right"),
  legAtomic("left_thigh_front", "Muslo izquierdo frente", "left"),
  legAtomic("left_thigh_back", "Muslo izquierdo espalda", "left"),
  legAtomic("left_thigh_inner", "Muslo izquierdo interior", "left"),
  legAtomic("left_thigh_outer", "Muslo izquierdo exterior", "left"),
  legAtomic("left_knee", "Rodilla izquierda", "left"),
  legAtomic("left_lower_leg_front", "Pierna izquierda frente", "left"),
  legAtomic("left_lower_leg_back", "Pierna izquierda espalda", "left"),
  legAtomic("left_lower_leg_inner", "Pierna izquierda interior", "left"),
  legAtomic("left_lower_leg_outer", "Pierna izquierda exterior", "left"),
  legAtomic("left_ankle", "Tobillo izquierdo", "left"),
  legAtomic("left_foot", "Pie izquierdo", "left"),
] as const;

export const PARENT_LEG_ZONES: readonly ParentBodyZoneDefinition[] = [
  legParent("right_thigh", "Muslo derecho", "right", [
    "right_thigh_front",
    "right_thigh_back",
    "right_thigh_inner",
    "right_thigh_outer",
  ]),
  legParent("left_thigh", "Muslo izquierdo", "left", [
    "left_thigh_front",
    "left_thigh_back",
    "left_thigh_inner",
    "left_thigh_outer",
  ]),
  legParent("right_lower_leg", "Pierna derecha", "right", [
    "right_lower_leg_front",
    "right_lower_leg_back",
    "right_lower_leg_inner",
    "right_lower_leg_outer",
  ]),
  legParent("left_lower_leg", "Pierna izquierda", "left", [
    "left_lower_leg_front",
    "left_lower_leg_back",
    "left_lower_leg_inner",
    "left_lower_leg_outer",
  ]),
] as const;

export const LEG_ZONE_HIERARCHIES: readonly BodyZoneHierarchy[] =
  PARENT_LEG_ZONES.map((p) => ({
    parentId: p.id,
    childIds: p.childIds,
  }));

export const RIGHT_FULL_LEG_GROUP: BodyZoneGroupDefinition = {
  id: "right_full_leg",
  label: "Pierna derecha completa",
  zoneIds: [
    "right_thigh",
    "right_knee",
    "right_lower_leg",
    "right_ankle",
    "right_foot",
  ],
};

export const LEFT_FULL_LEG_GROUP: BodyZoneGroupDefinition = {
  id: "left_full_leg",
  label: "Pierna izquierda completa",
  zoneIds: [
    "left_thigh",
    "left_knee",
    "left_lower_leg",
    "left_ankle",
    "left_foot",
  ],
};

export const BOTH_LEGS_GROUP: BodyZoneGroupDefinition = {
  id: "both_legs",
  label: "Ambas piernas",
  zoneIds: [RIGHT_FULL_LEG_GROUP.id, LEFT_FULL_LEG_GROUP.id],
};

export const ALL_BODY_ZONES: readonly BodyZoneDefinition[] = [
  ...ATOMIC_ARM_ZONES,
  ...PARENT_ARM_ZONES,
  ...ATOMIC_TORSO_ZONES,
  ...ATOMIC_PELVIS_ZONES,
  ...ATOMIC_LEG_ZONES,
  ...PARENT_LEG_ZONES,
  ...ATOMIC_HEAD_NECK_ZONES,
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

export const FULL_HIPS_GROUP: BodyZoneGroupDefinition = {
  id: "full_hips",
  label: "Caderas",
  zoneIds: ["left_hip", "right_hip"],
};

export const FULL_GLUTES_GROUP: BodyZoneGroupDefinition = {
  id: "full_glutes",
  label: "Glúteos",
  zoneIds: ["left_glute", "right_glute"],
};

export const POSTERIOR_PELVIS_GROUP: BodyZoneGroupDefinition = {
  id: "posterior_pelvis",
  label: "Pelvis posterior",
  zoneIds: ["sacrum", "left_glute", "right_glute"],
};

export const PELVIS_REGION_GROUP: BodyZoneGroupDefinition = {
  id: "pelvis_region",
  label: "Región pélvica",
  zoneIds: [
    FULL_HIPS_GROUP.id,
    FULL_GLUTES_GROUP.id,
    "sacrum",
    "lower_abdomen",
  ],
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

export const PELVIS_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  FULL_HIPS_GROUP,
  FULL_GLUTES_GROUP,
  POSTERIOR_PELVIS_GROUP,
  PELVIS_REGION_GROUP,
] as const;

export const LEG_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  RIGHT_FULL_LEG_GROUP,
  LEFT_FULL_LEG_GROUP,
  BOTH_LEGS_GROUP,
] as const;

export const HEAD_NECK_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  FULL_NECK_GROUP,
  FULL_FACE_GROUP,
  FULL_SCALP_GROUP,
  BOTH_EARS_GROUP,
  FULL_HEAD_GROUP,
] as const;

export const ALL_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  ...ARM_ZONE_GROUPS,
  ...TORSO_ZONE_GROUPS,
  ...PELVIS_ZONE_GROUPS,
  ...LEG_ZONE_GROUPS,
  ...HEAD_NECK_ZONE_GROUPS,
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

/** Pilotos de torso (18 meshes). */
export const TORSO_T1_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_torso_t1.glb";
export const TORSO_T2_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_torso_t2.glb";

/** Pilotos torso+pelvis (23 meshes). */
export const TORSO_PELVIS_P1_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_torso_pelvis_p1.glb";
export const TORSO_PELVIS_P2_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_torso_pelvis_p2.glb";

/** Mapa oficial congelado torso + pelvis (23 meshes atómicos). */
export const TORSO_PELVIS_FINAL_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_torso_pelvis_interaction.glb";

/** Pilotos longitudinales de piernas (10 meshes). */
export const LEGS_L1_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_legs_l1.glb";
export const LEGS_L2_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_legs_l2.glb";

/** Pilotos circunferenciales G1/G2 (22 meshes). */
export const LEGS_G1_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_legs_g1.glb";
export const LEGS_G2_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/neutro_body_v1_legs_g2.glb";

/** Mapa oficial de piernas detalladas (22 meshes). */
export const DETAILED_LEGS_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_detailed_legs_interaction.glb";

/** Mapa corporal integrado completo (81 meshes atómicos). */
export const BODY_81_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_body_interaction.glb";

/** @deprecated alias — mismo asset que BODY_81 tras Paso 31 */
export const BODY_69_INTERACTION_MODEL_SRC = BODY_81_INTERACTION_MODEL_SRC;

/** Mapa oficial cabeza/cuello (12 meshes). */
export const HEAD_NECK_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_head_neck_interaction.glb";

/** Alias de compatibilidad — IDs atómicos detallados de piernas. */
export const LEG_EXPERIMENTAL_DETAILED_ZONE_IDS =
  ATOMIC_LEG_ZONES.filter((z) =>
    z.id.includes("thigh_") || z.id.includes("lower_leg_"),
  ).map((z) => z.id);

export const LEG_LOGICAL_PARENT_IDS = PARENT_LEG_ZONES.map((z) => z.id);
export const LEG_LOGICAL_HIERARCHIES = LEG_ZONE_HIERARCHIES;

/** Validación automática del dominio de 81 zonas atómicas. */
export function validateBodyZoneDomain(): {
  ok: boolean;
  atomicArms: number;
  atomicTorsoPelvis: number;
  atomicLegs: number;
  atomicHeadNeck: number;
  totalAtomic: number;
  duplicateIds: string[];
  duplicateMeshNames: string[];
  parentsWithMesh: string[];
  groupsWithMesh: string[];
  atomicsMissingMesh: string[];
} {
  const atomics = ALL_BODY_ZONES.filter(isAtomicZone);
  const parents = ALL_BODY_ZONES.filter(isParentZone);
  const atomicArms = atomics.filter((z) => z.region === "arms" || z.region === "hands").length;
  const atomicLegs = atomics.filter((z) => z.region === "legs" || z.region === "feet").length;
  const atomicHeadNeck = atomics.filter((z) => z.region === "head").length;
  const atomicTorsoPelvis = atomics.filter((z) => z.region === "torso").length;

  const ids = ALL_BODY_ZONES.map((z) => z.id);
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);

  const meshNames = atomics.map((z) => z.interactionMeshName);
  const duplicateMeshNames = meshNames.filter(
    (n, i) => meshNames.indexOf(n) !== i,
  );

  const parentsWithMesh = parents
    .filter((p) => "interactionMeshName" in p && Boolean((p as { interactionMeshName?: string }).interactionMeshName))
    .map((p) => p.id);

  const groupsWithMesh = ALL_ZONE_GROUPS.filter((g) =>
    Boolean((g as { interactionMeshName?: string }).interactionMeshName),
  ).map((g) => g.id);

  const atomicsMissingMesh = atomics
    .filter((z) => !z.interactionMeshName)
    .map((z) => z.id);

  return {
    ok:
      atomicArms === 24 &&
      atomicTorsoPelvis === 23 &&
      atomicLegs === 22 &&
      atomicHeadNeck === 12 &&
      atomics.length === 81 &&
      duplicateIds.length === 0 &&
      duplicateMeshNames.length === 0 &&
      parentsWithMesh.length === 0 &&
      groupsWithMesh.length === 0 &&
      atomicsMissingMesh.length === 0,
    atomicArms,
    atomicTorsoPelvis,
    atomicLegs,
    atomicHeadNeck,
    totalAtomic: atomics.length,
    duplicateIds: [...new Set(duplicateIds)],
    duplicateMeshNames: [...new Set(duplicateMeshNames)],
    parentsWithMesh,
    groupsWithMesh,
    atomicsMissingMesh,
  };
}

/** Legacy longitudinal R2 (6 meshes derecho) — referencia. */
export const RIGHT_ARM_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_right_arm_interaction.glb";

export type ArmDebugVisibility = "right" | "left" | "both";

export type InteractionDebugLayer =
  | "arms"
  | "torso_t1"
  | "torso_t2"
  | "torso_pelvis_p1"
  | "torso_pelvis_p2"
  | "torso_pelvis_final"
  | "arms_and_torso_pelvis_p2"
  | "arms_and_torso_pelvis_final"
  | "legs_l1"
  | "legs_l2"
  | "legs_g1"
  | "legs_g2"
  | "detailed_legs"
  | "central_plus_arms_legs_l1"
  | "central_plus_arms_legs_l2"
  | "central_plus_arms_legs_g1"
  | "central_plus_arms_legs_g2"
  | "body_69"
  | "body_81"
  | "head_neck";

export type BodyRegionFilter =
  | "all"
  | "arms"
  | "torso_pelvis"
  | "legs"
  | "head_neck";

export function interactionModelSrcForLayer(
  layer: InteractionDebugLayer,
): string {
  if (layer === "torso_t1") return TORSO_T1_INTERACTION_MODEL_SRC;
  if (layer === "torso_t2") return TORSO_T2_INTERACTION_MODEL_SRC;
  if (layer === "torso_pelvis_p1") return TORSO_PELVIS_P1_INTERACTION_MODEL_SRC;
  if (layer === "torso_pelvis_p2" || layer === "arms_and_torso_pelvis_p2") {
    return TORSO_PELVIS_P2_INTERACTION_MODEL_SRC;
  }
  if (
    layer === "torso_pelvis_final" ||
    layer === "arms_and_torso_pelvis_final" ||
    layer === "central_plus_arms_legs_l1" ||
    layer === "central_plus_arms_legs_l2" ||
    layer === "central_plus_arms_legs_g1" ||
    layer === "central_plus_arms_legs_g2"
  ) {
    return TORSO_PELVIS_FINAL_INTERACTION_MODEL_SRC;
  }
  if (layer === "legs_l1") return LEGS_L1_INTERACTION_MODEL_SRC;
  if (layer === "legs_l2") return LEGS_L2_INTERACTION_MODEL_SRC;
  if (layer === "legs_g1") return LEGS_G1_INTERACTION_MODEL_SRC;
  if (layer === "legs_g2") return LEGS_G2_INTERACTION_MODEL_SRC;
  if (layer === "detailed_legs") return DETAILED_LEGS_INTERACTION_MODEL_SRC;
  if (layer === "head_neck") return HEAD_NECK_INTERACTION_MODEL_SRC;
  if (layer === "body_69" || layer === "body_81") return BODY_81_INTERACTION_MODEL_SRC;
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

