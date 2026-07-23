/**
 * Tipos del motor de interacción 3D (lab).
 * La selección de negocio guarda targets conceptuales, no solo atomics expandidos.
 */

export type SelectionTargetKind = "atomic" | "anatomical" | "commercial";

export type SelectionTargetId = string;

export type AtomicBodyZoneId = string;

export type SelectionTarget = {
  id: SelectionTargetId;
  kind: SelectionTargetKind;
  label: string;
  /** Atomic IDs directos o IDs de parents/groups a expandir. */
  memberIds: readonly string[];
};

export type ContextualSelectionOption = {
  targetId: SelectionTargetId;
  kind: SelectionTargetKind;
  label: string;
  /** Etiqueta corta para el botón del panel. */
  shortLabel: string;
  /** Agrupación visual: primary/amplify (producción) o exact/region/broad (lab). */
  tier: "exact" | "region" | "broad" | "primary" | "amplify";
};

export type BodyInteractionSelectionState = {
  hoveredAtomicZoneId: AtomicBodyZoneId | null;
  activeAtomicZoneId: AtomicBodyZoneId | null;
  selectedTargetIds: readonly SelectionTargetId[];
  resolvedSelectedAtomicZoneIds: readonly AtomicBodyZoneId[];
};

/** Pointer movement below this (CSS px) counts as click/tap, not orbit drag. */
export const CLICK_DRAG_THRESHOLD_PX = 8;
