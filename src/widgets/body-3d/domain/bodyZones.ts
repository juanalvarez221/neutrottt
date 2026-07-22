import type {
  BodyZoneDefinition,
  BodyZoneGroupDefinition,
  BodyZoneHierarchy,
} from "@/widgets/body-3d/domain/bodyZoneTypes";

/**
 * Piloto brazo derecho — zonas longitudinales gruesas (R2) + hijas circunferenciales experimentales.
 */

export const RIGHT_SHOULDER: BodyZoneDefinition = {
  id: "right_shoulder",
  label: "Hombro derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_shoulder",
  kind: "atomic",
};

export const RIGHT_UPPER_ARM: BodyZoneDefinition = {
  id: "right_upper_arm",
  label: "Brazo superior derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_upper_arm",
  kind: "coarse",
};

export const RIGHT_ELBOW: BodyZoneDefinition = {
  id: "right_elbow",
  label: "Codo derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_elbow",
  kind: "atomic",
};

export const RIGHT_FOREARM: BodyZoneDefinition = {
  id: "right_forearm",
  label: "Antebrazo derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_forearm",
  kind: "coarse",
};

export const RIGHT_WRIST: BodyZoneDefinition = {
  id: "right_wrist",
  label: "Muñeca derecha",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_wrist",
  kind: "atomic",
};

export const RIGHT_HAND: BodyZoneDefinition = {
  id: "right_hand",
  label: "Mano derecha",
  region: "hands",
  side: "right",
  interactionMeshName: "zone_right_hand",
  kind: "atomic",
};

/** Zonas longitudinales gruesas del piloto (producción). */
export const PILOT_BODY_ZONES: readonly BodyZoneDefinition[] = [
  RIGHT_SHOULDER,
  RIGHT_UPPER_ARM,
  RIGHT_ELBOW,
  RIGHT_FOREARM,
  RIGHT_WRIST,
  RIGHT_HAND,
] as const;

function makeArmQuad(
  parent: "right_upper_arm" | "right_forearm",
  quad: "front" | "back" | "inner" | "outer",
  label: string,
): BodyZoneDefinition {
  const id = `${parent}_${quad}` as const;
  return {
    id,
    label,
    region: "arms",
    side: "right",
    interactionMeshName: `zone_${id}`,
    kind: "atomic",
    parentId: parent,
  };
}

/** Subdivisiones circunferenciales experimentales (Paso 21). */
export const RIGHT_UPPER_ARM_FRONT = makeArmQuad(
  "right_upper_arm",
  "front",
  "Brazo superior derecho — frente",
);
export const RIGHT_UPPER_ARM_BACK = makeArmQuad(
  "right_upper_arm",
  "back",
  "Brazo superior derecho — espalda",
);
export const RIGHT_UPPER_ARM_INNER = makeArmQuad(
  "right_upper_arm",
  "inner",
  "Brazo superior derecho — interior",
);
export const RIGHT_UPPER_ARM_OUTER = makeArmQuad(
  "right_upper_arm",
  "outer",
  "Brazo superior derecho — exterior",
);

export const RIGHT_FOREARM_FRONT = makeArmQuad(
  "right_forearm",
  "front",
  "Antebrazo derecho — frente",
);
export const RIGHT_FOREARM_BACK = makeArmQuad(
  "right_forearm",
  "back",
  "Antebrazo derecho — espalda",
);
export const RIGHT_FOREARM_INNER = makeArmQuad(
  "right_forearm",
  "inner",
  "Antebrazo derecho — interior",
);
export const RIGHT_FOREARM_OUTER = makeArmQuad(
  "right_forearm",
  "outer",
  "Antebrazo derecho — exterior",
);

export const CIRCUMFERENTIAL_EXPERIMENTAL_ZONES: readonly BodyZoneDefinition[] =
  [
    RIGHT_UPPER_ARM_FRONT,
    RIGHT_UPPER_ARM_BACK,
    RIGHT_UPPER_ARM_INNER,
    RIGHT_UPPER_ARM_OUTER,
    RIGHT_FOREARM_FRONT,
    RIGHT_FOREARM_BACK,
    RIGHT_FOREARM_INNER,
    RIGHT_FOREARM_OUTER,
  ] as const;

export const BODY_ZONES_BY_ID: Readonly<Record<string, BodyZoneDefinition>> =
  Object.fromEntries(
    [...PILOT_BODY_ZONES, ...CIRCUMFERENTIAL_EXPERIMENTAL_ZONES].map((z) => [
      z.id,
      z,
    ]),
  );

export const RIGHT_UPPER_ARM_HIERARCHY: BodyZoneHierarchy = {
  parentId: RIGHT_UPPER_ARM.id,
  childIds: [
    RIGHT_UPPER_ARM_FRONT.id,
    RIGHT_UPPER_ARM_BACK.id,
    RIGHT_UPPER_ARM_INNER.id,
    RIGHT_UPPER_ARM_OUTER.id,
  ],
};

export const RIGHT_FOREARM_HIERARCHY: BodyZoneHierarchy = {
  parentId: RIGHT_FOREARM.id,
  childIds: [
    RIGHT_FOREARM_FRONT.id,
    RIGHT_FOREARM_BACK.id,
    RIGHT_FOREARM_INNER.id,
    RIGHT_FOREARM_OUTER.id,
  ],
};

export const EXPERIMENTAL_ZONE_HIERARCHIES: readonly BodyZoneHierarchy[] = [
  RIGHT_UPPER_ARM_HIERARCHY,
  RIGHT_FOREARM_HIERARCHY,
] as const;

/** Grupo piloto: brazo derecho completo (coarse). Sin mesh propio. */
export const RIGHT_FULL_ARM_GROUP: BodyZoneGroupDefinition = {
  id: "right_full_arm",
  label: "Brazo derecho completo",
  zoneIds: [
    RIGHT_SHOULDER.id,
    RIGHT_UPPER_ARM.id,
    RIGHT_ELBOW.id,
    RIGHT_FOREARM.id,
    RIGHT_WRIST.id,
    RIGHT_HAND.id,
  ],
};

export const PILOT_BODY_ZONE_GROUPS: readonly BodyZoneGroupDefinition[] = [
  RIGHT_FULL_ARM_GROUP,
] as const;

export const BODY_ZONE_GROUPS_BY_ID: Readonly<
  Record<string, BodyZoneGroupDefinition>
> = Object.fromEntries(PILOT_BODY_ZONE_GROUPS.map((g) => [g.id, g]));

export function getBodyZone(id: string): BodyZoneDefinition | undefined {
  return BODY_ZONES_BY_ID[id];
}

export function getBodyZoneGroup(
  id: string,
): BodyZoneGroupDefinition | undefined {
  return BODY_ZONE_GROUPS_BY_ID[id];
}

/** GLB longitudinal oficial (R2). */
export const RIGHT_ARM_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_right_arm_interaction.glb";

/** GLBs diagnóstico circunferencial (laboratorio). */
export const RIGHT_ARM_C1_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/right_arm_c1.glb";

export const RIGHT_ARM_C2_INTERACTION_MODEL_SRC =
  "/models/interaction/pilot/right_arm_c2.glb";

export type InteractionDebugModelId = "longitudinal" | "c1" | "c2";

export const INTERACTION_DEBUG_MODELS: Record<
  InteractionDebugModelId,
  { src: string; label: string }
> = {
  longitudinal: {
    src: RIGHT_ARM_INTERACTION_MODEL_SRC,
    label: "Longitudinal",
  },
  c1: {
    src: RIGHT_ARM_C1_INTERACTION_MODEL_SRC,
    label: "Circunferencial C1",
  },
  c2: {
    src: RIGHT_ARM_C2_INTERACTION_MODEL_SRC,
    label: "Circunferencial C2",
  },
};
