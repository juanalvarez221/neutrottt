import {
  TRIPO_PROTOTYPE_MODEL,
  type BodyModelDefinition,
} from "@/widgets/body-3d/bodyModelDefinition";

/**
 * Modelos disponibles en el laboratorio de evaluación.
 * Añadir aquí futuras entradas (p. ej. neutroBodyV1) sin tocar el visor.
 */
export const AVAILABLE_BODY_MODELS: readonly BodyModelDefinition[] = [
  TRIPO_PROTOTYPE_MODEL,
];

export const DEFAULT_LAB_BODY_MODEL: BodyModelDefinition =
  AVAILABLE_BODY_MODELS[0];
