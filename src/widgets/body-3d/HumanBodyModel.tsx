"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import type { Mesh } from "three";

export const HUMAN_BODY_MODEL_PATH = "/models/human_body.glb";

type HumanBodyModelProps = Omit<ThreeElements["group"], "children">;

export function HumanBodyModel(props: HumanBodyModelProps) {
  const { scene } = useGLTF(HUMAN_BODY_MODEL_PATH);

  const cloned = useMemo(() => {
    const next = scene.clone(true);
    next.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
    });
    return next;
  }, [scene]);

  return (
    <group {...props}>
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload(HUMAN_BODY_MODEL_PATH);
