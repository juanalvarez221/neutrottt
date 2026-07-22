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
  DETAILED_ARMS_INTERACTION_MODEL_SRC,
  type ArmDebugVisibility,
} from "@/widgets/body-3d/domain/bodyZones";

type InteractionZonesDebugProps = Omit<ThreeElements["group"], "children"> & {
  rotation?: [number, number, number];
  scale?: number;
  visualization?: "surface" | "edges";
  /** Laboratorio: filtrar meshes por lado. */
  armVisibility?: ArmDebugVisibility;
};

function disposeMaterial(material: Material | Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    mat.dispose();
  }
}

function sideVisible(name: string, visibility: ArmDebugVisibility): boolean {
  if (visibility === "both") return true;
  if (visibility === "right") return name.includes("zone_right_");
  return name.includes("zone_left_");
}

/**
 * Superpone el InteractionModel bilateral sobre el BodyVisual.
 * Solo laboratorio — sin hover/click/selección.
 */
export function InteractionZonesDebug({
  rotation = [0, 0, 0],
  scale = 1,
  visualization = "surface",
  armVisibility = "both",
  ...props
}: InteractionZonesDebugProps) {
  const { scene } = useGLTF(DETAILED_ARMS_INTERACTION_MODEL_SRC);

  const prepared = useMemo(() => {
    const cloned = scene.clone(true);
    const materials: Material[] = [];

    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.visible = sideVisible(mesh.name, armVisibility);

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
  }, [scene, visualization, armVisibility]);

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

useGLTF.preload(DETAILED_ARMS_INTERACTION_MODEL_SRC);
