/**
 * Labels profesionales en español para el selector 3D.
 * No mostrar IDs técnicos al usuario.
 */

import { BODY_ZONES_BY_ID } from "@/widgets/body-3d/domain/bodyZones";
import { SELECTION_TARGETS_BY_ID } from "@/widgets/body-3d/domain/bodySelectionTargets";

const SIDE_ES: Record<string, string> = {
  right: "derecho",
  left: "izquierdo",
};

const FACE_ES: Record<string, string> = {
  front: "Parte frontal",
  back: "Parte posterior",
  inner: "Cara interna",
  outer: "Cara externa",
};

const ATOMIC_LABEL_OVERRIDES: Record<string, string> = {
  right_shoulder: "Hombro derecho",
  left_shoulder: "Hombro izquierdo",
  right_elbow: "Codo derecho",
  left_elbow: "Codo izquierdo",
  right_wrist: "Muñeca derecha",
  left_wrist: "Muñeca izquierda",
  right_hand: "Mano derecha",
  left_hand: "Mano izquierda",
  right_knee: "Rodilla derecha",
  left_knee: "Rodilla izquierda",
  right_ankle: "Tobillo derecho",
  left_ankle: "Tobillo izquierdo",
  right_foot: "Pie derecho",
  left_foot: "Pie izquierdo",
  left_chest: "Pecho izquierdo",
  right_chest: "Pecho derecho",
  sternum: "Esternón",
  upper_abdomen: "Abdomen superior",
  lower_abdomen: "Abdomen inferior",
  left_ribs: "Costillas izquierdas",
  right_ribs: "Costillas derechas",
  left_flank: "Costado izquierdo",
  right_flank: "Costado derecho",
  left_scapula: "Omóplato izquierdo",
  right_scapula: "Omóplato derecho",
  upper_back_center: "Espalda superior central",
  left_mid_back: "Espalda media izquierda",
  right_mid_back: "Espalda media derecha",
  mid_back_center: "Espalda media central",
  left_lower_back: "Espalda baja izquierda",
  right_lower_back: "Espalda baja derecha",
  lower_back_center: "Espalda baja central",
  left_hip: "Cadera izquierda",
  right_hip: "Cadera derecha",
  left_glute: "Glúteo izquierdo",
  right_glute: "Glúteo derecho",
  sacrum: "Sacro",
  neck_front: "Cuello · Frente",
  neck_back: "Nuca",
  neck_left: "Cuello izquierdo",
  neck_right: "Cuello derecho",
  face_left: "Rostro izquierdo",
  face_right: "Rostro derecho",
  head_top: "Coronilla",
  head_back: "Cabeza · Posterior",
  head_left_side: "Cabeza · Lateral izquierdo",
  head_right_side: "Cabeza · Lateral derecho",
  left_ear: "Oreja izquierda",
  right_ear: "Oreja derecha",
  // Pierna inferior: frontal = espinilla; posterior = pantorrilla (sin "Parte …")
  right_lower_leg_front: "Espinilla derecha",
  right_lower_leg_back: "Pantorrilla derecha",
  right_lower_leg_inner: "Pierna derecha · Cara interna",
  right_lower_leg_outer: "Pierna derecha · Cara externa",
  left_lower_leg_front: "Espinilla izquierda",
  left_lower_leg_back: "Pantorrilla izquierda",
  left_lower_leg_inner: "Pierna izquierda · Cara interna",
  left_lower_leg_outer: "Pierna izquierda · Cara externa",
};

function formatLimbQuad(
  side: "left" | "right",
  segment: "upper_arm" | "forearm" | "thigh" | "lower_leg",
  face: string,
): string | null {
  if (segment === "lower_leg") {
    // Handled by overrides for natural pantorrilla/espinilla copy
    return null;
  }
  const faceLabel = FACE_ES[face];
  if (!faceLabel) return null;
  const sideLabel = SIDE_ES[side];
  const segmentLabel =
    segment === "upper_arm"
      ? "Brazo superior"
      : segment === "forearm"
        ? "Antebrazo"
        : "Muslo";
  return `${segmentLabel} ${sideLabel} · ${faceLabel}`;
}

/**
 * Label de producto para atomic / parent / group / commercial target.
 */
export function getSelectionDisplayLabel(id: string): string {
  const target = SELECTION_TARGETS_BY_ID[id];
  if (target) return target.label;

  if (ATOMIC_LABEL_OVERRIDES[id]) return ATOMIC_LABEL_OVERRIDES[id];

  const limbMatch = id.match(
    /^(right|left)_(upper_arm|forearm|thigh|lower_leg)_(front|back|inner|outer)$/,
  );
  if (limbMatch) {
    const formatted = formatLimbQuad(
      limbMatch[1] as "left" | "right",
      limbMatch[2] as "upper_arm" | "forearm" | "thigh" | "lower_leg",
      limbMatch[3],
    );
    if (formatted) return formatted;
  }

  const zone = BODY_ZONES_BY_ID[id];
  if (zone) return zone.label;

  return id;
}

/** Convierte `zone_right_forearm_outer` / `zone_foo.001` → atomic id. */
export function interactionMeshNameToAtomicId(
  meshName: string,
): string | null {
  const base = meshName.split(".")[0] ?? meshName;
  if (!base.startsWith("zone_")) return null;
  const id = base.slice("zone_".length);
  return BODY_ZONES_BY_ID[id] ? id : null;
}

export function atomicIdToInteractionMeshName(atomicId: string): string {
  return `zone_${atomicId}`;
}
