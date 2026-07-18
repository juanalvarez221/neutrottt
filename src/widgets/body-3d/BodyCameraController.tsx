"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";
import {
  getCameraLookTarget,
  getCameraPositionForView,
} from "@/widgets/body-3d/cameraViewHelpers";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

type BodyCameraControllerProps = {
  view: BodyCameraView;
  framing: BodyCameraFraming;
  /** Incrementar para re-disparar el preset aunque la vista no cambie. */
  viewToken: number;
  orbitRef: RefObject<OrbitControlsImpl | null>;
};

/**
 * Interpola la cámara hacia presets front/back/left/right.
 * Recibe framing del modelo activo — no hardcodea distancias Tripo.
 */
export function BodyCameraController({
  view,
  framing,
  viewToken,
  orbitRef,
}: BodyCameraControllerProps) {
  const { camera } = useThree();
  const targetPos = useRef(getCameraPositionForView(view, framing));
  const targetLook = useRef(getCameraLookTarget(framing));
  const animating = useRef(false);

  useEffect(() => {
    targetPos.current = getCameraPositionForView(view, framing);
    targetLook.current = getCameraLookTarget(framing);
    animating.current = true;

    const orbit = orbitRef.current;
    if (orbit) {
      orbit.enabled = false;
    }
  }, [framing, orbitRef, view, viewToken]);

  useFrame((_, delta) => {
    if (!animating.current) return;

    const orbit = orbitRef.current;
    const alpha = 1 - Math.exp(-4.2 * delta);

    camera.position.lerp(targetPos.current, alpha);
    if (orbit) {
      orbit.target.lerp(targetLook.current, alpha);
      orbit.update();
    } else {
      camera.lookAt(targetLook.current);
    }

    const posDone = camera.position.distanceTo(targetPos.current) < 0.01;
    const lookDone =
      !orbit || orbit.target.distanceTo(targetLook.current) < 0.01;

    if (posDone && lookDone) {
      camera.position.copy(targetPos.current);
      if (orbit) {
        orbit.target.copy(targetLook.current);
        orbit.enabled = true;
        orbit.update();
      }
      animating.current = false;
    }
  });

  return null;
}
