"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";
import {
  getCameraLookTarget,
  getCameraPositionForView,
} from "@/widgets/body-3d/cameraViewHelpers";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";
import type { CameraFocusPose } from "@/widgets/body-3d/ux/bodyCameraFocus";

type BodyCameraControllerProps = {
  view: BodyCameraView;
  framing: BodyCameraFraming;
  viewToken: number;
  orbitRef: RefObject<OrbitControlsImpl | null>;
  /** Focus suave por región (premium UX). null = solo presets de vista. */
  focusPose?: CameraFocusPose | null;
  focusToken?: number;
  reducedMotion?: boolean;
};

/**
 * Interpola cámara hacia presets o focus regional.
 * Tras animar, re-habilita OrbitControls — no lucha con el usuario.
 *
 * Importante: no depender del prop `target` controlado de OrbitControls;
 * este controller es la única autoridad del look-at durante la animación.
 */
export function BodyCameraController({
  view,
  framing,
  viewToken,
  orbitRef,
  focusPose = null,
  focusToken = 0,
  reducedMotion = false,
}: BodyCameraControllerProps) {
  const { camera } = useThree();
  const targetPos = useRef(getCameraPositionForView(view, framing));
  const targetLook = useRef(getCameraLookTarget(framing));
  const animating = useRef(false);

  // Sembrar look-at inicial cuando OrbitControls monta (sin prop controlado).
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const seed = () => {
      const orbit = orbitRef.current;
      if (orbit) {
        if (!animating.current) {
          orbit.target.copy(getCameraLookTarget(framing));
          orbit.update();
        }
        return;
      }
      frames += 1;
      if (frames < 30) raf = requestAnimationFrame(seed);
    };
    raf = requestAnimationFrame(seed);
    return () => cancelAnimationFrame(raf);
  }, [framing, orbitRef]);

  useEffect(() => {
    if (focusPose) {
      targetPos.current = focusPose.position.clone();
      targetLook.current = focusPose.target.clone();
    } else {
      targetPos.current = getCameraPositionForView(view, framing);
      targetLook.current = getCameraLookTarget(framing);
    }
    animating.current = true;

    const orbit = orbitRef.current;
    if (orbit) {
      orbit.enabled = false;
    }

    if (reducedMotion) {
      camera.position.copy(targetPos.current);
      if (orbit) {
        orbit.target.copy(targetLook.current);
        orbit.enabled = true;
        orbit.update();
      } else {
        camera.lookAt(targetLook.current);
      }
      animating.current = false;
    }
  }, [
    camera,
    focusPose,
    focusToken,
    framing,
    orbitRef,
    reducedMotion,
    view,
    viewToken,
  ]);

  useFrame((_, delta) => {
    if (!animating.current) return;

    const orbit = orbitRef.current;
    // Más agresivo para llegar a vistas canónicas (BACK real) sin quedarse
    // en un frontal-diagonal a mitad de camino.
    const alpha = 1 - Math.exp(-6.5 * delta);

    camera.position.lerp(targetPos.current, alpha);
    if (orbit) {
      orbit.target.lerp(targetLook.current, alpha);
      orbit.update();
    } else {
      camera.lookAt(targetLook.current);
    }

    const posDone = camera.position.distanceTo(targetPos.current) < 0.008;
    const lookDone =
      !orbit || orbit.target.distanceTo(targetLook.current) < 0.008;

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

/** Helper para comparar poses sin recrear refs innecesarias en padres. */
export function poseKey(pose: CameraFocusPose | null | undefined): string {
  if (!pose) return "none";
  const p = pose.position;
  const t = pose.target;
  return `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}|${t.x.toFixed(3)},${t.y.toFixed(3)},${t.z.toFixed(3)}`;
}

export function clonePose(pose: CameraFocusPose): CameraFocusPose {
  return {
    position: new Vector3().copy(pose.position),
    target: new Vector3().copy(pose.target),
  };
}
