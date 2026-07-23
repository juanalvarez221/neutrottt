import { Vector3 } from "three";
import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";
import {
  MODEL_BACK,
  MODEL_FORWARD,
  MODEL_LEFT,
  MODEL_RIGHT,
  resolveCanonicalAzimuth,
  type CanonicalBodyView,
} from "@/widgets/body-3d/domain/bodyModelCoordinateSystem";

export type BodyCameraFraming = BodyModelDefinition["camera"];

const CARDINAL_TO_CANONICAL: Record<BodyCameraView, CanonicalBodyView> = {
  front: "FRONT",
  back: "BACK",
  left: "LEFT",
  right: "RIGHT",
};

/**
 * Posición de cámara para presets orbit.
 * Usa el contrato único de bodyModelCoordinateSystem (frente +Z).
 */
export function getCameraPositionForView(
  view: BodyCameraView,
  framing: BodyCameraFraming,
): Vector3 {
  const [tx, ty, tz] = framing.target;
  const d = framing.distance;
  const az = resolveCanonicalAzimuth(CARDINAL_TO_CANONICAL[view]);
  return new Vector3(
    tx + Math.sin(az) * d,
    ty,
    tz + Math.cos(az) * d,
  );
}

export function getCameraLookTarget(framing: BodyCameraFraming): Vector3 {
  return new Vector3(...framing.target);
}

/** Eje mundo hacia el que mira una vista cardinal (para tests). */
export function axisForCardinalView(view: BodyCameraView): Vector3 {
  switch (view) {
    case "front":
      return MODEL_FORWARD.clone();
    case "back":
      return MODEL_BACK.clone();
    case "left":
      return MODEL_LEFT.clone();
    case "right":
      return MODEL_RIGHT.clone();
  }
}
