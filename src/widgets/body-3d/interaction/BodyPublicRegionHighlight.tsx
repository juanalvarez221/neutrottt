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
import {
  BODY_PUBLIC_REGIONS_MODEL_SRC,
  type PublicHighlightRegionId,
} from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    for (const m of material) m.dispose();
  } else {
    material.dispose();
  }
}

const HOVER_COLOR = "#c49a6c";
const PREVIEW_COLOR = "#d4a066";
const SELECTED_COLOR = "#e8a840";

type HighlightKind = "hover" | "preview" | "selected" | null;

function meshNameToPublicRegionId(name: string): string | null {
  const base = name.split(".")[0] ?? name;
  if (!base.startsWith("public_")) return null;
  return base.slice("public_".length);
}

function kindFor(
  regionId: string | null,
  hoveredId: string | null,
  previewIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
): HighlightKind {
  if (!regionId) return null;
  if (selectedIds.has(regionId)) return "selected";
  if (previewIds.has(regionId)) return "preview";
  if (regionId === hoveredId) return "hover";
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

    const regionId = meshNameToPublicRegionId(mesh.name);
    const kind = kindFor(regionId, hoveredId, previewIds, selectedIds);

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
      kind === "selected" ? 0.4 : kind === "preview" ? 0.32 : 0.2;

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
    mat.polygonOffsetFactor = -4;
    mat.polygonOffsetUnits = -4;
    materials.push(mat);
    mesh.material = mat;
    mesh.raycast = () => undefined;
  });

  return { cloned, materials };
}

export type BodyPublicRegionHighlightProps = {
  rotation?: [number, number, number];
  scale?: number;
  /** Región pública en hover (raro; suele usarse preview). */
  hoveredPublicRegionId?: string | null;
  previewPublicRegionIds?: readonly PublicHighlightRegionId[] | readonly string[];
  selectedPublicRegionIds?: readonly PublicHighlightRegionId[] | readonly string[];
};

/**
 * Overlay visual del PublicRegionHighlightModel.
 * SELECTED > PREVIEW > HOVER. No hace raycast.
 */
export function BodyPublicRegionHighlight({
  rotation = [0, 0, 0],
  scale = 1,
  hoveredPublicRegionId = null,
  previewPublicRegionIds = [],
  selectedPublicRegionIds = [],
}: BodyPublicRegionHighlightProps) {
  const { scene } = useGLTF(BODY_PUBLIC_REGIONS_MODEL_SRC);
  const selectedSet = useMemo(
    () => new Set(selectedPublicRegionIds),
    [selectedPublicRegionIds],
  );
  const previewSet = useMemo(
    () => new Set(previewPublicRegionIds),
    [previewPublicRegionIds],
  );

  const prepared = useMemo(
    () =>
      prepareHighlightScene(
        scene,
        hoveredPublicRegionId,
        previewSet,
        selectedSet,
      ),
    [scene, hoveredPublicRegionId, previewSet, selectedSet],
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

useGLTF.preload(BODY_PUBLIC_REGIONS_MODEL_SRC);
