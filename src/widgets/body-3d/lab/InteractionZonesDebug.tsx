"use client";

import { useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import {
  DoubleSide,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
} from "three";
import {
  INTERACTION_DEBUG_MODELS,
  type InteractionDebugModelId,
} from "@/widgets/body-3d/domain/bodyZones";

type InteractionZonesDebugProps = Omit<ThreeElements["group"], "children"> & {
  rotation?: [number, number, number];
  scale?: number;
  visualization?: "surface" | "edges";
  /** Qué asset de interacción cargar (laboratorio). */
  debugModel?: InteractionDebugModelId;
};

function disposeMaterial(material: Material | Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    mat.dispose();
  }
}

function InteractionZonesDebugScene({
  src,
  visualization,
  rotation,
  scale,
  ...props
}: {
  src: string;
  visualization: "surface" | "edges";
  rotation: [number, number, number];
  scale: number;
} & Omit<ThreeElements["group"], "children" | "rotation" | "scale">) {
  const { scene } = useGLTF(src);

  const prepared = useMemo(() => {
    const cloned = scene.clone(true);
    const materials: Material[] = [];

    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];

      const next = mats.map((mat) => {
        const std = (mat as MeshStandardMaterial).clone() as MeshStandardMaterial;
        if (visualization === "edges") {
          std.transparent = false;
          std.opacity = 1;
          std.depthWrite = true;
          std.wireframe = true;
        } else {
          std.transparent = true;
          std.opacity = 0.42;
          std.depthWrite = false;
          std.wireframe = false;
        }
        std.side = DoubleSide;
        std.polygonOffset = true;
        std.polygonOffsetFactor = -2;
        std.polygonOffsetUnits = -2;
        std.needsUpdate = true;
        materials.push(std);
        return std;
      });

      mesh.material = next.length === 1 ? next[0] : next;
    });

    return { cloned, materials };
  }, [scene, visualization]);

  useLayoutEffect(() => {
    return () => {
      for (const mat of prepared.materials) {
        disposeMaterial(mat);
      }
    };
  }, [prepared]);

  return (
    <group {...props} rotation={rotation} scale={[scale, scale, scale]}>
      <primitive object={prepared.cloned} />
    </group>
  );
}

/**
 * Superpone el InteractionModel de laboratorio sobre el BodyVisual.
 * Sin hover, click ni selección.
 */
export function InteractionZonesDebug({
  rotation = [0, 0, 0],
  scale = 1,
  visualization = "surface",
  debugModel = "longitudinal",
  ...props
}: InteractionZonesDebugProps) {
  const src = INTERACTION_DEBUG_MODELS[debugModel].src;

  return (
    <InteractionZonesDebugScene
      {...props}
      src={src}
      visualization={visualization}
      rotation={rotation}
      scale={scale}
    />
  );
}

useGLTF.preload(INTERACTION_DEBUG_MODELS.longitudinal.src);
useGLTF.preload(INTERACTION_DEBUG_MODELS.c1.src);
useGLTF.preload(INTERACTION_DEBUG_MODELS.c2.src);
