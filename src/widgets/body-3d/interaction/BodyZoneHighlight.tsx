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

/** Neutro camel / sand — premium, no neón */
const HOVER_COLOR = "#b88958";
const PREVIEW_COLOR = "#d4a066";
const SELECTED_COLOR = "#e8a840";

type HighlightKind = "hover" | "preview" | "selected" | null;

function kindFor(
  atomicId: string | null,
  hoveredId: string | null,
  previewIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
): HighlightKind {
  if (!atomicId) return null;
  if (selectedIds.has(atomicId)) return "selected";
  if (previewIds.has(atomicId)) return "preview";
  if (atomicId === hoveredId) return "hover";
  return null;
}

function prepareHighlightScene(
  scene: Object3D,
  hoveredId: string | null,
  previewIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
) {
  const cloned = scene.clone(true);
  const materials: Material[] = [];

  cloned.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;

    const atomicId = interactionMeshNameToAtomicId(mesh.name);
    const kind = kindFor(atomicId, hoveredId, previewIds, selectedIds);

    mesh.frustumCulled = false;
    mesh.visible = kind !== null;
    mesh.renderOrder =
      kind === "selected" ? 5 : kind === "preview" ? 4 : kind === "hover" ? 3 : 2;

    if (!mesh.visible) {
      mesh.material = new ThreeMeshBasicMaterial({ visible: false });
      materials.push(mesh.material as Material);
      return;
    }

    const color =
      kind === "selected"
        ? SELECTED_COLOR
        : kind === "preview"
          ? PREVIEW_COLOR
          : HOVER_COLOR;
    const opacity =
      kind === "selected" ? 0.48 : kind === "preview" ? 0.36 : 0.22;

    const mat = new ThreeMeshBasicMaterial({
      color,
      transparent: true,
      opacity,
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
    mesh.raycast = () => undefined;
  });

  return { cloned, materials };
}

export type BodyZoneHighlightProps = {
  rotation?: [number, number, number];
  scale?: number;
  hoveredAtomicZoneId: string | null;
  previewAtomicZoneIds?: readonly string[];
  selectedAtomicZoneIds: readonly string[];
};

/**
 * Overlay visual: SELECTED > PREVIEW > HOVER.
 */
export function BodyZoneHighlight({
  rotation = [0, 0, 0],
  scale = 1,
  hoveredAtomicZoneId,
  previewAtomicZoneIds = [],
  selectedAtomicZoneIds,
}: BodyZoneHighlightProps) {
  const { scene } = useGLTF(BODY_81_INTERACTION_MODEL_SRC);
  const selectedSet = useMemo(
    () => new Set(selectedAtomicZoneIds),
    [selectedAtomicZoneIds],
  );
  const previewSet = useMemo(
    () => new Set(previewAtomicZoneIds),
    [previewAtomicZoneIds],
  );

  const prepared = useMemo(
    () =>
      prepareHighlightScene(
        scene,
        hoveredAtomicZoneId,
        previewSet,
        selectedSet,
      ),
    [scene, hoveredAtomicZoneId, previewSet, selectedSet],
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
