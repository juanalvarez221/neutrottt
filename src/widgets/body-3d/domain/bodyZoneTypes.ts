/**
 * Tipos de dominio para zonas corporales del selector 3D.
 * Independientes del BodyVisual (GLB de apariencia).
 */

export type BodyZoneSide = "left" | "right" | "center";

export type BodyZoneRegion =
  | "head"
  | "torso"
  | "arms"
  | "hands"
  | "legs"
  | "feet";

/**
 * Zona atómica seleccionable — tiene mesh en el InteractionModel detallado.
 */
export type AtomicBodyZoneDefinition = {
  id: string;
  label: string;
  region: BodyZoneRegion;
  side: BodyZoneSide;
  kind: "atomic";
  /** Nombre estable del mesh en el GLB de interacción. */
  interactionMeshName: string;
  /** Parent lógico (coarse) si aplica. */
  parentId?: string;
};

/**
 * Zona padre / coarse — solo lógica de dominio; sin mesh propio en el modelo detallado.
 */
export type ParentBodyZoneDefinition = {
  id: string;
  label: string;
  region: BodyZoneRegion;
  side: BodyZoneSide;
  kind: "parent";
  /** IDs atómicos contenidos. */
  childIds: readonly string[];
};

export type BodyZoneDefinition =
  | AtomicBodyZoneDefinition
  | ParentBodyZoneDefinition;

/**
 * Grupo lógico de zonas (brazo completo, ambos brazos, etc.). Sin mesh.
 */
export type BodyZoneGroupDefinition = {
  id: string;
  label: string;
  /** IDs de dominio (pueden ser atómicos o parents). */
  zoneIds: readonly string[];
};

/** Relación parent → hijos atómicos. */
export type BodyZoneHierarchy = {
  parentId: string;
  childIds: readonly string[];
};

export function isAtomicZone(
  zone: BodyZoneDefinition,
): zone is AtomicBodyZoneDefinition {
  return zone.kind === "atomic";
}

export function isParentZone(
  zone: BodyZoneDefinition,
): zone is ParentBodyZoneDefinition {
  return zone.kind === "parent";
}
