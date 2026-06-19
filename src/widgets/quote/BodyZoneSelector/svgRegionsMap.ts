import type { Side } from "./bodyZonesConfig";

/**
 * Maps the abstract anatomical zones to concrete SVG path ids and back.
 * Templates may carry the `{side}` token, expanded by `expandRegions`.
 */

export const ZONE_REGIONS: Record<string, string[]> = {
  head: ["zone-head-front", "zone-head-back"],
  neck: ["zone-neck-front", "zone-neck-back"],
  shoulder: ["zone-shoulder-{side}", "zone-trap-{side}"],
  chest: [
    "zone-chest-left",
    "zone-chest-right",
    "zone-sternum",
    "zone-ribs-left",
    "zone-ribs-right",
  ],
  abdomen: ["zone-abdomen-upper", "zone-abdomen-lower", "zone-ribs-left", "zone-ribs-right"],
  back: [
    "zone-upper-back",
    "zone-mid-back",
    "zone-lower-back",
    "zone-ribs-left",
    "zone-ribs-right",
    "zone-trap-left",
    "zone-trap-right",
  ],
  arm: [
    "zone-shoulder-{side}",
    "zone-bicep-{side}",
    "zone-tricep-{side}",
    "zone-forearm-int-{side}",
    "zone-forearm-ext-{side}",
  ],
  hand: ["zone-hand-{side}"],
  leg: [
    "zone-quad-{side}",
    "zone-knee-{side}",
    "zone-shin-{side}",
    "zone-hamstring-{side}",
    "zone-calf-{side}",
  ],
  foot: ["zone-foot-{side}", "zone-foot-back-{side}"],
};

/** Every concrete region id rendered in the mannequin, mapped to its zone. */
export const REGION_TO_ZONE: Record<string, string> = {
  "zone-head-front": "head",
  "zone-head-back": "head",
  "zone-neck-front": "neck",
  "zone-neck-back": "neck",
  "zone-shoulder-left": "shoulder",
  "zone-shoulder-right": "shoulder",
  "zone-trap-left": "shoulder",
  "zone-trap-right": "shoulder",
  "zone-chest-left": "chest",
  "zone-chest-right": "chest",
  "zone-sternum": "chest",
  "zone-abdomen-upper": "abdomen",
  "zone-abdomen-lower": "abdomen",
  "zone-ribs-left": "abdomen",
  "zone-ribs-right": "abdomen",
  "zone-upper-back": "back",
  "zone-mid-back": "back",
  "zone-lower-back": "back",
  "zone-bicep-left": "arm",
  "zone-bicep-right": "arm",
  "zone-tricep-left": "arm",
  "zone-tricep-right": "arm",
  "zone-forearm-int-left": "arm",
  "zone-forearm-int-right": "arm",
  "zone-forearm-ext-left": "arm",
  "zone-forearm-ext-right": "arm",
  "zone-hand-left": "hand",
  "zone-hand-right": "hand",
  "zone-quad-left": "leg",
  "zone-quad-right": "leg",
  "zone-knee-left": "leg",
  "zone-knee-right": "leg",
  "zone-shin-left": "leg",
  "zone-shin-right": "leg",
  "zone-hamstring-left": "leg",
  "zone-hamstring-right": "leg",
  "zone-calf-left": "leg",
  "zone-calf-right": "leg",
  "zone-foot-left": "foot",
  "zone-foot-right": "foot",
  "zone-foot-back-left": "foot",
  "zone-foot-back-right": "foot",
};

/** Human readable labels for the hover tooltip on the mannequin. */
export const REGION_LABELS: Record<string, string> = {
  "zone-head-front": "Rostro",
  "zone-head-back": "Nuca",
  "zone-neck-front": "Cuello (frente)",
  "zone-neck-back": "Cuello (nuca)",
  "zone-shoulder-left": "Hombro izquierdo",
  "zone-shoulder-right": "Hombro derecho",
  "zone-trap-left": "Trapecio izquierdo",
  "zone-trap-right": "Trapecio derecho",
  "zone-chest-left": "Pecho izquierdo",
  "zone-chest-right": "Pecho derecho",
  "zone-sternum": "Esternón",
  "zone-abdomen-upper": "Abdomen superior",
  "zone-abdomen-lower": "Abdomen inferior",
  "zone-ribs-left": "Costado izquierdo",
  "zone-ribs-right": "Costado derecho",
  "zone-upper-back": "Espalda alta",
  "zone-mid-back": "Espalda media",
  "zone-lower-back": "Espalda baja / lumbar",
  "zone-bicep-left": "Bícep izquierdo",
  "zone-bicep-right": "Bícep derecho",
  "zone-tricep-left": "Trícep izquierdo",
  "zone-tricep-right": "Trícep derecho",
  "zone-forearm-int-left": "Antebrazo interno izq.",
  "zone-forearm-int-right": "Antebrazo interno der.",
  "zone-forearm-ext-left": "Antebrazo externo izq.",
  "zone-forearm-ext-right": "Antebrazo externo der.",
  "zone-hand-left": "Mano izquierda",
  "zone-hand-right": "Mano derecha",
  "zone-quad-left": "Cuádriceps izquierdo",
  "zone-quad-right": "Cuádriceps derecho",
  "zone-knee-left": "Rodilla izquierda",
  "zone-knee-right": "Rodilla derecha",
  "zone-shin-left": "Espinilla izquierda",
  "zone-shin-right": "Espinilla derecha",
  "zone-hamstring-left": "Isquiotibial izquierdo",
  "zone-hamstring-right": "Isquiotibial derecho",
  "zone-calf-left": "Pantorrilla izquierda",
  "zone-calf-right": "Pantorrilla derecha",
  "zone-foot-left": "Pie izquierdo",
  "zone-foot-right": "Pie derecho",
  "zone-foot-back-left": "Talón izquierdo",
  "zone-foot-back-right": "Talón derecho",
};

/** Expands region templates, resolving the `{side}` token. */
export function expandRegions(regions: string[] | undefined, side: Side | null): string[] {
  if (!regions || regions.length === 0) return [];
  const out: string[] = [];
  for (const region of regions) {
    if (!region.includes("{side}")) {
      out.push(region);
      continue;
    }
    if (side === "left" || side === "right") {
      out.push(region.replace("{side}", side));
    } else {
      out.push(region.replace("{side}", "left"), region.replace("{side}", "right"));
    }
  }
  return out;
}
