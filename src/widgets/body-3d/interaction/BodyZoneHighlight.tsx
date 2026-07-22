"use client";

import { useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import {
  DoubleSide,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  MeshBasicMaterial as ThreeMeshBasicMaterial,
} from "three";
import { BODY_81_INTERACTION_MODEL_SRC } from "@/widgets/body-3d/domain/bodyZones";
import { interactionMeshNameToAtomicId } from "@/widgets/body-3d/interaction/bodyInteractionLabels";

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    for (const m of material) m.dispose();
  } else {
    material.dispose();
  }
}

const HOVER_COLOR = "#c4a574";
const SELECTED_COLOR = "#e8d2a8";

function prepareHighlightScene(
  scene: Object3D,
  hoveredId: string | null,
  selectedIds: ReadonlySet<string>,
) {
  const cloned = scene.clone(true);
  const materials: Material[] = [];

  cloned.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;

    const atomicId = interactionMeshNameToAtomicId(mesh.name);
    const isSelected = atomicId ? selectedIds.has(atomicId) : false;
    const isHovered = atomicId !== null && atomicId === hoveredId;

    mesh.frustumCulled = false;
    mesh.visible = isSelected || isHovered;
    // Selected dominates over hover visually
    mesh.renderOrder = isSelected ? 4 : isHovered ? 3 : 2;

    if (!mesh.visible) {
      mesh.material = new ThreeMeshBasicMaterial({ visible: false });
      materials.push(mesh.material as Material);
      return;
    }

    const mat = new ThreeMeshBasicMaterial({
      color: isSelected ? SELECTED_COLOR : HOVER_COLOR,
      transparent: true,
      opacity: isSelected ? 0.42 : 0.28,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      toneMapped: false,
    }) as MeshBasicMaterial;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    materials.push(mat);
    mesh.material = mat;
    // Highlights must not steal pointer events from the invisible raycast layer
    mesh.raycast = () => undefined;
  });

  return { cloned, materials };
}

export type BodyZoneHighlightProps = {
  rotation?: [number, number, number];
  scale?: number;
  hoveredAtomicZoneId: string | null;
  selectedAtomicZoneIds: readonly string[];
};

/**
 * Overlay visual independiente (hover + selected).
 * Usa geometría del InteractionModel; no muta BodyVisual ni useGLTF cache.
 */
export function BodyZoneHighlight({
  rotation = [0, 0, 0],
  scale = 1,
  hoveredAtomicZoneId,
  selectedAtomicZoneIds,
}: BodyZoneHighlightProps) {
  const { scene } = useGLTF(BODY_81_INTERACTION_MODEL_SRC);
  const selectedSet = useMemo(
    () => new Set(selectedAtomicZoneIds),
    [selectedAtomicZoneIds],
  );

  const prepared = useMemo(
    () => prepareHighlightScene(scene, hoveredAtomicZoneId, selectedSet),
    [scene, hoveredAtomicZoneId, selectedSet],
  );

  useLayoutEffect(() => {
    return () => {
      for (const mat of prepared.materials) {
        disposeMaterial(mat);
      }
    };
  }, [prepared]);

  return (
    <group rotation={rotation} scale={[scale, scale, scale]}>
      <primitive object={prepared.cloned} />
    </group>
  );
}
