import {
  NEUTRO_BODY_V1_MODEL,
  TRIPO_PROTOTYPE_MODEL,
  type BodyModelDefinition,
} from "@/widgets/body-3d/bodyModelDefinition";

/**
 * Modelos disponibles en el laboratorio de evaluación.
 * Añadir aquí futuras entradas sin tocar el visor.
 */
export const AVAILABLE_BODY_MODELS: readonly BodyModelDefinition[] = [
  NEUTRO_BODY_V1_MODEL,
  TRIPO_PROTOTYPE_MODEL,
];

export const DEFAULT_LAB_BODY_MODEL: BodyModelDefinition = NEUTRO_BODY_V1_MODEL;