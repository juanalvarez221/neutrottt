"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import {
  Color,
  MeshStandardMaterial,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { MODEL_Y_UP_FRONT_OFFSET } from "@/widgets/body-3d/bodyModelOrientation";
import type { BodyAppearanceMode } from "@/widgets/body-3d/bodyViewerTypes";

export const HUMAN_BODY_MODEL_PATH = "/models/human_body.glb";

type HumanBodyModelProps = Omit<ThreeElements["group"], "children"> & {
  appearance?: BodyAppearanceMode;
  wireframe?: boolean;
};

function createNeutralMaterial(wireframe: boolean) {
  return new MeshStandardMaterial({
    color: new Color("#c4b4a0"),
    roughness: 0.72,
    metalness: 0.04,
    flatShading: false,
    wireframe,
  });
}

function disposeMaterial(material: Material | Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    mat.dispose();
  }
}

function collectMeshes(root: Object3D) {
  const meshes: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

export function HumanBodyModel({
  appearance = "original",
  wireframe = false,
  ...props
}: HumanBodyModelProps) {
  const { scene } = useGLTF(HUMAN_BODY_MODEL_PATH);
  const neutralMaterialRef = useRef<MeshStandardMaterial | null>(null);

  const prepared = useMemo(() => {
    const cloned = scene.clone(true);
    const originals = new Map<string, Material | Material[]>();

    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;

      // Clonar materiales del mesh para no mutar el cache de useGLTF.
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => mat.clone());
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
      }
      originals.set(mesh.uuid, mesh.material);
    });

    return { cloned, originals };
  }, [scene]);

  useEffect(() => {
    const { cloned, originals } = prepared;
    const meshes = collectMeshes(cloned);

    if (appearance === "neutral") {
      if (!neutralMaterialRef.current) {
        neutralMaterialRef.current = createNeutralMaterial(wireframe);
      } else {
        neutralMaterialRef.current.wireframe = wireframe;
        neutralMaterialRef.current.needsUpdate = true;
      }

      for (const mesh of meshes) {
        mesh.material = neutralMaterialRef.current;
      }
    } else {
      for (const mesh of meshes) {
        const original = originals.get(mesh.uuid);
        if (!original) continue;
        mesh.material = original;
        const list = Array.isArray(original) ? original : [original];
        for (const mat of list) {
          const std = mat as MeshStandardMaterial;
          if ("wireframe" in std) {
            std.wireframe = wireframe;
            std.needsUpdate = true;
          }
        }
      }
    }
  }, [appearance, prepared, wireframe]);

  useEffect(() => {
    const originals = prepared.originals;
    return () => {
      if (neutralMaterialRef.current) {
        neutralMaterialRef.current.dispose();
        neutralMaterialRef.current = null;
      }
      for (const material of originals.values()) {
        disposeMaterial(material);
      }
    };
  }, [prepared]);

  return (
    <group {...props} rotation={[0, MODEL_Y_UP_FRONT_OFFSET, 0]}>
      <primitive object={prepared.cloned} />
    </group>
  );
}

useGLTF.preload(HUMAN_BODY_MODEL_PATH);
