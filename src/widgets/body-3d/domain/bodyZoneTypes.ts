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
 * Zona atómica seleccionable.
 * `id` es el contrato de dominio; `interactionMeshName` mapea al mesh del InteractionModel.
 */
export type BodyZoneDefinition = {
  id: string;
  label: string;
  region: BodyZoneRegion;
  side: BodyZoneSide;
  /** Nombre estable del mesh en el GLB de interacción (si existe). */
  interactionMeshName: string;
};

/**
 * Grupo lógico de zonas. No tiene mesh propio.
 */
export type BodyZoneGroupDefinition = {
  id: string;
  label: string;
  /** IDs de dominio de las zonas miembros (orden de composición). */
  zoneIds: readonly string[];
};
