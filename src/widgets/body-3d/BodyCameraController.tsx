"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  LAB_CAMERA_DISTANCE,
  LAB_CAMERA_TARGET_Y,
} from "@/widgets/body-3d/bodyModelOrientation";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

type BodyCameraControllerProps = {
  view: BodyCameraView;
  /** Incrementar para re-disparar el preset aunque la vista no cambie. */
  viewToken: number;
  orbitRef: RefObject<OrbitControlsImpl | null>;
};

function viewToCameraPosition(view: BodyCameraView, distance: number) {
  switch (view) {
    case "front":
      return new Vector3(0, LAB_CAMERA_TARGET_Y, distance);
    case "back":
      return new Vector3(0, LAB_CAMERA_TARGET_Y, -distance);
    case "left":
      // Perfil del lado izquierdo anatómico del sujeto (cámara en -X mundo).
      return new Vector3(-distance, LAB_CAMERA_TARGET_Y, 0);
    case "right":
      return new Vector3(distance, LAB_CAMERA_TARGET_Y, 0);
  }
}

export function BodyCameraController({
  view,
  viewToken,
  orbitRef,
}: BodyCameraControllerProps) {
  const { camera } = useThree();
  const targetPos = useRef(viewToCameraPosition(view, LAB_CAMERA_DISTANCE));
  const targetLook = useRef(new Vector3(0, LAB_CAMERA_TARGET_Y, 0));
  const animating = useRef(false);

  useEffect(() => {
    targetPos.current = viewToCameraPosition(view, LAB_CAMERA_DISTANCE);
    targetLook.current.set(0, LAB_CAMERA_TARGET_Y, 0);
    animating.current = true;

    const orbit = orbitRef.current;
    if (orbit) {
      orbit.enabled = false;
    }
  }, [orbitRef, view, viewToken]);

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
