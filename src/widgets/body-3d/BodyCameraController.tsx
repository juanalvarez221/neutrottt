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
import { stepOrbitCamera } from "@/widgets/body-3d/ux/bodyCameraOrbit";

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

function applyPose(
  camera: { position: Vector3; lookAt: (v: Vector3) => void },
  orbit: OrbitControlsImpl | null,
  position: Vector3,
  look: Vector3,
  enableOrbit: boolean,
) {
  camera.position.copy(position);
  if (orbit) {
    orbit.target.copy(look);
    orbit.enabled = enableOrbit;
    if (enableOrbit) orbit.update();
  } else {
    camera.lookAt(look);
  }
}

/**
 * Interpola cámara hacia presets o focus regional.
 * Tras animar, re-habilita OrbitControls — no lucha con el usuario.
 *
 * Importante: no depender del prop `target` controlado de OrbitControls;
 * este controller es la única autoridad del look-at durante la animación.
 *
 * Frente/Espalda se interpolan en órbita esférica. Un lerp lineal atravesaría
 * el look-at y OrbitControls.update() reconstruiría un azimuth inestable.
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
  const animElapsed = useRef(0);
  const currentLook = useRef(getCameraLookTarget(framing));
  const scratchPos = useRef(new Vector3());
  const scratchLook = useRef(new Vector3());

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
    animElapsed.current = 0;

    const orbit = orbitRef.current;
    if (orbit) {
      orbit.enabled = false;
      currentLook.current.copy(orbit.target);
    } else {
      currentLook.current.copy(targetLook.current);
    }

    if (reducedMotion) {
      applyPose(camera, orbit, targetPos.current, targetLook.current, true);
      currentLook.current.copy(targetLook.current);
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
    animElapsed.current += delta;
    // Órbita agresiva: Frente↔Espalda es 180° y debe llegar al hemisferio real.
    const alpha = 1 - Math.exp(-10.5 * delta);
    const forceSnap = animElapsed.current > 1.15;

    const settled =
      forceSnap ||
      stepOrbitCamera(
        camera.position,
        currentLook.current,
        targetPos.current,
        targetLook.current,
        alpha,
        scratchPos.current,
        scratchLook.current,
      );

    if (!forceSnap) {
      // No llamar orbit.update() a mitad de órbita: reconstruye spherical
      // y puede clavar la cámara en un frontal-diagonal.
      camera.position.copy(scratchPos.current);
      currentLook.current.copy(scratchLook.current);
      if (orbit) {
        orbit.target.copy(scratchLook.current);
      }
      camera.lookAt(currentLook.current);
    }

    if (settled) {
      applyPose(camera, orbit, targetPos.current, targetLook.current, true);
      currentLook.current.copy(targetLook.current);
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
