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
  PILOT_BODY_ZONES,
  RIGHT_ARM_INTERACTION_MODEL_SRC,
} from "@/widgets/body-3d/domain/bodyZones";

type InteractionZonesDebugProps = Omit<ThreeElements["group"], "children"> & {
  /** Rotación del BodyVisual activo (misma orientación espacial). */
  rotation?: [number, number, number];
  scale?: number;
  /** Laboratorio: `surface` = relleno debug; `edges` = wireframe de fronteras. */
  visualization?: "surface" | "edges";
};

const EXPECTED_MESH_NAMES = new Set(
  PILOT_BODY_ZONES.map((z) => z.interactionMeshName),
);

function disposeMaterial(material: Material | Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    mat.dispose();
  }
}

/**
 * Superpone el InteractionModel piloto sobre el BodyVisual.
 * Solo diagnóstico de laboratorio: sin hover, click ni selección.
 */
export function InteractionZonesDebug({
  rotation = [0, 0, 0],
  scale = 1,
  visualization = "surface",
  ...props
}: InteractionZonesDebugProps) {
  const { scene } = useGLTF(RIGHT_ARM_INTERACTION_MODEL_SRC);

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
          std.wireframeLinewidth = 1;
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

      if (mesh.name && !EXPECTED_MESH_NAMES.has(mesh.name)) {
        console.warn(
          `[InteractionZonesDebug] mesh inesperado: ${mesh.name}`,
        );
      }
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

useGLTF.preload(RIGHT_ARM_INTERACTION_MODEL_SRC);
