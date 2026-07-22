import type {
  BodyZoneDefinition,
  BodyZoneGroupDefinition,
} from "@/widgets/body-3d/domain/bodyZoneTypes";

/**
 * Piloto Paso 19 — solo brazo derecho (6 zonas macroscópicas).
 * No incluye subdivisiones front/back/inner/outer ni el resto del cuerpo.
 */

export const RIGHT_SHOULDER: BodyZoneDefinition = {
  id: "right_shoulder",
  label: "Hombro derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_shoulder",
};

export const RIGHT_UPPER_ARM: BodyZoneDefinition = {
  id: "right_upper_arm",
  label: "Brazo superior derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_upper_arm",
};

export const RIGHT_ELBOW: BodyZoneDefinition = {
  id: "right_elbow",
  label: "Codo derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_elbow",
};

export const RIGHT_FOREARM: BodyZoneDefinition = {
  id: "right_forearm",
  label: "Antebrazo derecho",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_forearm",
};

export const RIGHT_WRIST: BodyZoneDefinition = {
  id: "right_wrist",
  label: "Muñeca derecha",
  region: "arms",
  side: "right",
  interactionMeshName: "zone_right_wrist",
};

export const RIGHT_HAND: BodyZoneDefinition = {
  id: "right_hand",
  label: "Mano derecha",
  region: "hands",
  side: "right",
  interactionMeshName: "zone_right_hand",
};

/** Zonas atómicas del piloto (orden proximal → distal). */
export const PILOT_BODY_ZONES: readonly BodyZoneDefinition[] = [
  RIGHT_SHOULDER,
  RIGHT_UPPER_ARM,
  RIGHT_ELBOW,
  RIGHT_FOREARM,
  RIGHT_WRIST,
  RIGHT_HAND,
] as const;

export const BODY_ZONES_BY_ID: Readonly<Record<string, BodyZoneDefinition>> =
  Object.fromEntries(PILOT_BODY_ZONES.map((z) => [z.id, z]));

/** Grupo piloto: brazo derecho completo. Sin mesh propio. */
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

/** Ruta pública del GLB de interacción del piloto. */
export const RIGHT_ARM_INTERACTION_MODEL_SRC =
  "/models/interaction/neutro_body_v1_right_arm_interaction.glb";
