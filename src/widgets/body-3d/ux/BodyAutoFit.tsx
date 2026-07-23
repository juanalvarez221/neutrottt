/**
 * Mide el bbox del BodyVisual (post-Center) y notifica framing de cuerpo completo.
 */

"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, type Group } from "three";
import {
  computeFitFramingFromBox,
  type FittedBodyFraming,
} from "@/widgets/body-3d/ux/bodyFitFraming";

type BodyAutoFitProps = {
  children: ReactNode;
  enabled?: boolean;
  verticalFill: number;
  fitToken?: number;
  onFit: (framing: FittedBodyFraming) => void;
};

/**
 * Envuelve la escena visual; tras el primer layout con geometría válida,
 * calcula el framing de cuerpo completo.
 */
export function BodyAutoFit({
  children,
  enabled = true,
  verticalFill,
  fitToken = 0,
  onFit,
}: BodyAutoFitProps) {
  const rootRef = useRef<Group>(null);
  const { camera, size } = useThree();
  const onFitRef = useRef(onFit);
  const lastKeyRef = useRef("");

  useLayoutEffect(() => {
    onFitRef.current = onFit;
  }, [onFit]);

  useLayoutEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let attempts = 0;
    let rafOuter = 0;
    let rafInner = 0;

    const run = () => {
      if (cancelled || !rootRef.current) return;
      const box = new Box3().setFromObject(rootRef.current);
      if (box.isEmpty()) {
        if (attempts < 12) {
          attempts += 1;
          rafInner = requestAnimationFrame(run);
        }
        return;
      }

      const aspect =
        size.width > 0 && size.height > 0 ? size.width / size.height : 1;
      const fovDeg = "fov" in camera ? (camera.fov as number) : 42;
      const framing = computeFitFramingFromBox(box, {
        fovDeg,
        aspect,
        verticalFill,
      });
      if (!framing) return;

      const key = [
        fitToken,
        framing.distance.toFixed(3),
        framing.target.map((n) => n.toFixed(3)).join(","),
        verticalFill.toFixed(2),
        aspect.toFixed(3),
      ].join("|");

      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      onFitRef.current(framing);
    };

    // Center de drei aplica en useLayoutEffect; medimos en el siguiente frame.
    rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(run);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafInner);
    };
  }, [camera, enabled, fitToken, size.height, size.width, verticalFill]);

  return <group ref={rootRef}>{children}</group>;
}
