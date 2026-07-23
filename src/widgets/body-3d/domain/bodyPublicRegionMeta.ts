/**
 * Fuente única de presentación pública del selector corporal.
 * shortLabel → chips / tooltip
 * fullLabel + description → panel activo / sheet
 */

export type PublicRegionSide = "left" | "right" | "center" | "both";
export type PublicRegionSurface =
  | "anterior"
  | "posterior"
  | "inner"
  | "outer"
  | "lateral"
  | "full"
  | "top"
  | "mixed";
export type PublicRegionCategory =
  | "arm"
  | "torso"
  | "back"
  | "leg"
  | "head"
  | "neck"
  | "hand"
  | "foot"
  | "hip"
  | "other";

export type PublicRegionMeta = {
  id: string;
  shortLabel: string;
  fullLabel: string;
  description: string;
  side: PublicRegionSide;
  surface: PublicRegionSurface;
  category: PublicRegionCategory;
};

function meta(
  id: string,
  shortLabel: string,
  description: string,
  side: PublicRegionSide,
  surface: PublicRegionSurface,
  category: PublicRegionCategory,
  fullLabel?: string,
): PublicRegionMeta {
  return {
    id,
    shortLabel,
    fullLabel: fullLabel ?? `${shortLabel} · ${description}`,
    description,
    side,
    surface,
    category,
  };
}

/** Metadata profesional de todos los targets públicos. */
export const PUBLIC_REGION_META: readonly PublicRegionMeta[] = [
  // Brazos — precisión anatómica
  meta(
    "right_biceps_region",
    "Bíceps derecho",
    "Cara anterior del brazo superior",
    "right",
    "anterior",
    "arm",
  ),
  meta(
    "left_biceps_region",
    "Bíceps izquierdo",
    "Cara anterior del brazo superior",
    "left",
    "anterior",
    "arm",
  ),
  meta(
    "right_triceps_region",
    "Tríceps derecho",
    "Cara posterior del brazo superior",
    "right",
    "posterior",
    "arm",
  ),
  meta(
    "left_triceps_region",
    "Tríceps izquierdo",
    "Cara posterior del brazo superior",
    "left",
    "posterior",
    "arm",
  ),
  meta(
    "right_forearm_inner_region",
    "Antebrazo derecho · Cara interna",
    "Cara interna del antebrazo",
    "right",
    "inner",
    "arm",
  ),
  meta(
    "left_forearm_inner_region",
    "Antebrazo izquierdo · Cara interna",
    "Cara interna del antebrazo",
    "left",
    "inner",
    "arm",
  ),
  meta(
    "right_forearm_outer_region",
    "Antebrazo derecho · Cara externa",
    "Cara externa del antebrazo",
    "right",
    "outer",
    "arm",
  ),
  meta(
    "left_forearm_outer_region",
    "Antebrazo izquierdo · Cara externa",
    "Cara externa del antebrazo",
    "left",
    "outer",
    "arm",
  ),
  meta(
    "right_upper_arm",
    "Brazo superior derecho",
    "Circunferencia del brazo superior",
    "right",
    "full",
    "arm",
  ),
  meta(
    "left_upper_arm",
    "Brazo superior izquierdo",
    "Circunferencia del brazo superior",
    "left",
    "full",
    "arm",
  ),
  meta(
    "right_forearm",
    "Antebrazo derecho completo",
    "Circunferencia del antebrazo",
    "right",
    "full",
    "arm",
  ),
  meta(
    "left_forearm",
    "Antebrazo izquierdo completo",
    "Circunferencia del antebrazo",
    "left",
    "full",
    "arm",
  ),
  meta(
    "right_shoulder",
    "Hombro derecho",
    "Región deltoidea",
    "right",
    "full",
    "arm",
  ),
  meta(
    "left_shoulder",
    "Hombro izquierdo",
    "Región deltoidea",
    "left",
    "full",
    "arm",
  ),
  meta(
    "right_full_sleeve",
    "Manga completa derecha",
    "Hombro a muñeca",
    "right",
    "full",
    "arm",
  ),
  meta(
    "left_full_sleeve",
    "Manga completa izquierda",
    "Hombro a muñeca",
    "left",
    "full",
    "arm",
  ),
  meta(
    "right_upper_half_sleeve",
    "Media manga superior derecha",
    "Hombro a codo",
    "right",
    "full",
    "arm",
  ),
  meta(
    "left_upper_half_sleeve",
    "Media manga superior izquierda",
    "Hombro a codo",
    "left",
    "full",
    "arm",
  ),
  meta(
    "right_lower_half_sleeve",
    "Media manga inferior derecha",
    "Codo a muñeca",
    "right",
    "full",
    "arm",
  ),
  meta(
    "left_lower_half_sleeve",
    "Media manga inferior izquierda",
    "Codo a muñeca",
    "left",
    "full",
    "arm",
  ),
  meta("right_hand", "Mano derecha", "Dorso y palma", "right", "full", "hand"),
  meta("left_hand", "Mano izquierda", "Dorso y palma", "left", "full", "hand"),

  // Torso
  meta(
    "right_chest",
    "Pectoral derecho",
    "Región pectoral derecha",
    "right",
    "anterior",
    "torso",
  ),
  meta(
    "left_chest",
    "Pectoral izquierdo",
    "Región pectoral izquierda",
    "left",
    "anterior",
    "torso",
  ),
  meta(
    "full_chest",
    "Pecho completo",
    "Región pectoral",
    "both",
    "anterior",
    "torso",
    "Pecho completo · Región pectoral",
  ),
  meta(
    "full_abdomen",
    "Abdomen completo",
    "Región abdominal frontal",
    "center",
    "anterior",
    "torso",
  ),
  meta(
    "left_ribs",
    "Costillas izquierdas",
    "Rejilla costal izquierda",
    "left",
    "lateral",
    "torso",
  ),
  meta(
    "right_ribs",
    "Costillas derechas",
    "Rejilla costal derecha",
    "right",
    "lateral",
    "torso",
  ),
  meta(
    "left_flank",
    "Costado izquierdo",
    "Flanco lateral izquierdo",
    "left",
    "lateral",
    "torso",
  ),
  meta(
    "right_flank",
    "Costado derecho",
    "Flanco lateral derecho",
    "right",
    "lateral",
    "torso",
  ),

  // Espalda
  meta(
    "upper_back_large",
    "Espalda alta",
    "Región escapular y dorsal superior",
    "both",
    "posterior",
    "back",
  ),
  meta(
    "lower_back_large",
    "Espalda baja",
    "Región lumbar",
    "both",
    "posterior",
    "back",
  ),
  meta(
    "full_back",
    "Espalda completa",
    "Región dorsal y lumbar",
    "both",
    "posterior",
    "back",
  ),

  // Piernas
  meta(
    "right_thigh_front",
    "Muslo derecho · Cara anterior",
    "Cara anterior del muslo",
    "right",
    "anterior",
    "leg",
  ),
  meta(
    "right_thigh_back",
    "Muslo derecho · Cara posterior",
    "Cara posterior del muslo",
    "right",
    "posterior",
    "leg",
  ),
  meta(
    "right_thigh_inner",
    "Muslo derecho · Cara interna",
    "Cara interna del muslo",
    "right",
    "inner",
    "leg",
  ),
  meta(
    "right_thigh_outer",
    "Muslo derecho · Cara externa",
    "Cara externa del muslo",
    "right",
    "outer",
    "leg",
  ),
  meta(
    "left_thigh_front",
    "Muslo izquierdo · Cara anterior",
    "Cara anterior del muslo",
    "left",
    "anterior",
    "leg",
  ),
  meta(
    "left_thigh_back",
    "Muslo izquierdo · Cara posterior",
    "Cara posterior del muslo",
    "left",
    "posterior",
    "leg",
  ),
  meta(
    "left_thigh_inner",
    "Muslo izquierdo · Cara interna",
    "Cara interna del muslo",
    "left",
    "inner",
    "leg",
  ),
  meta(
    "left_thigh_outer",
    "Muslo izquierdo · Cara externa",
    "Cara externa del muslo",
    "left",
    "outer",
    "leg",
  ),
  meta(
    "right_thigh",
    "Muslo derecho completo",
    "Circunferencia del muslo",
    "right",
    "full",
    "leg",
  ),
  meta(
    "left_thigh",
    "Muslo izquierdo completo",
    "Circunferencia del muslo",
    "left",
    "full",
    "leg",
  ),
  meta(
    "right_lower_leg_front",
    "Espinilla derecha",
    "Cara anterior de la pierna inferior",
    "right",
    "anterior",
    "leg",
  ),
  meta(
    "left_lower_leg_front",
    "Espinilla izquierda",
    "Cara anterior de la pierna inferior",
    "left",
    "anterior",
    "leg",
  ),
  meta(
    "right_lower_leg_back",
    "Pantorrilla derecha",
    "Cara posterior de la pierna inferior",
    "right",
    "posterior",
    "leg",
  ),
  meta(
    "left_lower_leg_back",
    "Pantorrilla izquierda",
    "Cara posterior de la pierna inferior",
    "left",
    "posterior",
    "leg",
  ),
  meta(
    "right_lower_leg",
    "Pierna inferior derecha completa",
    "Circunferencia de la pierna inferior",
    "right",
    "full",
    "leg",
  ),
  meta(
    "left_lower_leg",
    "Pierna inferior izquierda completa",
    "Circunferencia de la pierna inferior",
    "left",
    "full",
    "leg",
  ),
  meta(
    "right_full_leg",
    "Pierna derecha completa",
    "Muslo a pie",
    "right",
    "full",
    "leg",
  ),
  meta(
    "left_full_leg",
    "Pierna izquierda completa",
    "Muslo a pie",
    "left",
    "full",
    "leg",
  ),
  meta("right_foot", "Pie derecho", "Dorso y planta", "right", "full", "foot"),
  meta("left_foot", "Pie izquierdo", "Dorso y planta", "left", "full", "foot"),

  // Cadera / glúteos
  meta("left_hip", "Cadera izquierda", "Región de cadera", "left", "full", "hip"),
  meta("right_hip", "Cadera derecha", "Región de cadera", "right", "full", "hip"),
  meta(
    "left_glute",
    "Glúteo izquierdo",
    "Región glútea izquierda",
    "left",
    "posterior",
    "hip",
  ),
  meta(
    "right_glute",
    "Glúteo derecho",
    "Región glútea derecha",
    "right",
    "posterior",
    "hip",
  ),
  meta(
    "full_glutes",
    "Glúteos completos",
    "Región glútea bilateral",
    "both",
    "posterior",
    "hip",
  ),

  // Cabeza
  meta(
    "head_top",
    "Cabeza · Parte superior",
    "Zona superior del cráneo",
    "center",
    "top",
    "head",
  ),
  meta(
    "head_back",
    "Cabeza · Parte posterior",
    "Occipital y nuca alta",
    "center",
    "posterior",
    "head",
  ),
  meta(
    "head_left_region",
    "Cabeza · Lateral izquierdo",
    "Lateral izquierdo del cráneo",
    "left",
    "lateral",
    "head",
  ),
  meta(
    "head_right_region",
    "Cabeza · Lateral derecho",
    "Lateral derecho del cráneo",
    "right",
    "lateral",
    "head",
  ),
  meta(
    "full_scalp",
    "Cuero cabelludo completo",
    "Calota completa",
    "both",
    "full",
    "head",
  ),
  meta(
    "full_head",
    "Cabeza completa",
    "Cuero cabelludo y rostro",
    "both",
    "full",
    "head",
  ),
  meta("full_face", "Rostro", "Región facial completa", "both", "anterior", "head"),

  // Cuello
  meta(
    "neck_front",
    "Cuello · Parte anterior",
    "Cara anterior del cuello",
    "center",
    "anterior",
    "neck",
  ),
  meta(
    "neck_back",
    "Cuello · Parte posterior",
    "Cara posterior del cuello",
    "center",
    "posterior",
    "neck",
  ),
  meta(
    "neck_left",
    "Cuello · Lateral izquierdo",
    "Lateral izquierdo del cuello",
    "left",
    "lateral",
    "neck",
  ),
  meta(
    "neck_right",
    "Cuello · Lateral derecho",
    "Lateral derecho del cuello",
    "right",
    "lateral",
    "neck",
  ),
  meta(
    "full_neck",
    "Cuello completo",
    "Circunferencia del cuello",
    "both",
    "full",
    "neck",
  ),
];

export const PUBLIC_REGION_META_BY_ID: Readonly<Record<string, PublicRegionMeta>> =
  Object.fromEntries(PUBLIC_REGION_META.map((m) => [m.id, m]));

export function getPublicRegionMeta(id: string): PublicRegionMeta | undefined {
  return PUBLIC_REGION_META_BY_ID[id];
}

export function getPublicShortLabel(id: string): string {
  return PUBLIC_REGION_META_BY_ID[id]?.shortLabel ?? id;
}

export function getPublicFullLabel(id: string): string {
  return PUBLIC_REGION_META_BY_ID[id]?.fullLabel ?? getPublicShortLabel(id);
}

export function getPublicDescription(id: string): string | null {
  return PUBLIC_REGION_META_BY_ID[id]?.description ?? null;
}
