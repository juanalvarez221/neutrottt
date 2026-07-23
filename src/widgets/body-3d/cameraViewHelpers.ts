import { Vector3 } from "three";
import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

export type BodyCameraFraming = BodyModelDefinition["camera"];

/**
 * Posición de cámara para presets orbit (modelo centrado, frente en +Z mundo).
 * Lógica reusable — no conoce ningún GLB concreto.
 */
export function getCameraPositionForView(
  view: BodyCameraView,
  framing: BodyCameraFraming,
): Vector3 {
  const [tx, ty, tz] = framing.target;
  const d = framing.distance;

  switch (view) {
    case "front":
      return new Vector3(tx, ty, tz + d);
    case "back":
      return new Vector3(tx, ty, tz - d);
    case "left":
      // Lado izquierdo anatómico del sujeto → cámara en -X.
      return new Vector3(tx - d, ty, tz);
    case "right":
      return new Vector3(tx + d, ty, tz);
  }
}

export function getCameraLookTarget(framing: BodyCameraFraming): Vector3 {
  return new Vector3(...framing.target);
}
