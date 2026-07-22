"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import {
  DoubleSide,
  Mesh,
  type Material,
  type Mesh as ThreeMesh,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import { BODY_81_INTERACTION_MODEL_SRC } from "@/widgets/body-3d/domain/bodyZones";
import { interactionMeshNameToAtomicId } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import { CLICK_DRAG_THRESHOLD_PX } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    for (const m of material) m.dispose();
  } else {
    material.dispose();
  }
}

function prepareInvisibleRaycastScene(scene: Object3D) {
  const cloned = scene.clone(true);
  const materials: Material[] = [];

  cloned.traverse((obj) => {
    const mesh = obj as ThreeMesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.visible = true;

    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];

    const next = mats.map((mat) => {
      const std = (mat as MeshStandardMaterial).clone() as MeshStandardMaterial;
      std.transparent = true;
      std.opacity = 0;
      std.depthWrite = false;
      std.colorWrite = false;
      std.side = DoubleSide;
      std.toneMapped = false;
      std.needsUpdate = true;
      materials.push(std);
      return std;
    });

    mesh.material = next.length === 1 ? next[0]! : next;
    // Keep raycasting on invisible interaction meshes
    mesh.raycast = Mesh.prototype.raycast;
  });

  return { cloned, materials };
}

type PointerSession = {
  x: number;
  y: number;
  atomicId: string | null;
};

export type BodyInteractionModelProps = {
  rotation?: [number, number, number];
  scale?: number;
  enabled?: boolean;
  onHoverAtomicZone: (atomicId: string | null) => void;
  onActivateAtomicZone: (atomicId: string) => void;
};

/**
 * Capa invisible raycasteable del InteractionModel (81 zonas).
 * No aporta apariencia al BodyVisual.
 */
export function BodyInteractionModel({
  rotation = [0, 0, 0],
  scale = 1,
  enabled = true,
  onHoverAtomicZone,
  onActivateAtomicZone,
}: BodyInteractionModelProps) {
  const { scene } = useGLTF(BODY_81_INTERACTION_MODEL_SRC);
  const prepared = useMemo(() => prepareInvisibleRaycastScene(scene), [scene]);
  const sessionRef = useRef<PointerSession | null>(null);

  useLayoutEffect(() => {
    return () => {
      for (const mat of prepared.materials) {
        disposeMaterial(mat);
      }
    };
  }, [prepared]);

  function atomicFromEvent(event: ThreeEvent<PointerEvent>): string | null {
    return interactionMeshNameToAtomicId(event.object.name);
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (!enabled) return;
    event.stopPropagation();
    onHoverAtomicZone(atomicFromEvent(event));
  }

  function handlePointerOut() {
    if (!enabled) return;
    onHoverAtomicZone(null);
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!enabled) return;
    // Only primary button / touch
    if (event.button !== undefined && event.button !== 0) return;
    event.stopPropagation();
    sessionRef.current = {
      x: event.clientX,
      y: event.clientY,
      atomicId: atomicFromEvent(event),
    };
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (!enabled) return;
    const start = sessionRef.current;
    sessionRef.current = null;
    if (!start?.atomicId) return;
    if (event.button !== undefined && event.button !== 0) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Drag → OrbitControls; click/tap → activate zone menu
    if (Math.hypot(dx, dy) >= CLICK_DRAG_THRESHOLD_PX) return;

    const id = atomicFromEvent(event) ?? start.atomicId;
    if (id) {
      event.stopPropagation();
      onActivateAtomicZone(id);
    }
  }

  return (
    <group rotation={rotation} scale={[scale, scale, scale]}>
      <primitive
        object={prepared.cloned}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />
    </group>
  );
}

useGLTF.preload(BODY_81_INTERACTION_MODEL_SRC);
