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
import {
  prefetchPublicRegionMaskRaster,
  resolvePublicHitFromUv,
} from "@/widgets/body-3d/interaction/bodyPublicMaskHit";

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
  uv: { x: number; y: number } | null;
};

export type BodyInteractionModelProps = {
  rotation?: [number, number, number];
  scale?: number;
  enabled?: boolean;
  onHoverAtomicZone: (atomicId: string | null) => void;
  onActivateAtomicZone: (atomicId: string) => void;
  /** Coordenadas de pantalla para tooltip (desktop). */
  onHoverPointer?: (point: { x: number; y: number } | null) => void;
  /** Se dispara cuando el GLB de interacción está preparado. */
  onReady?: () => void;
};

/**
 * Capa invisible raycasteable del InteractionModel (81 zonas).
 * No aporta apariencia al BodyVisual.
 * Public hit authority: categorical UV mask (not mesh name partitions).
 */
export function BodyInteractionModel({
  rotation = [0, 0, 0],
  scale = 1,
  enabled = true,
  onHoverAtomicZone,
  onActivateAtomicZone,
  onHoverPointer,
  onReady,
}: BodyInteractionModelProps) {
  const { scene } = useGLTF(BODY_81_INTERACTION_MODEL_SRC);
  const prepared = useMemo(() => prepareInvisibleRaycastScene(scene), [scene]);
  const sessionRef = useRef<PointerSession | null>(null);
  const onReadyRef = useRef(onReady);
  const hoverSeq = useRef(0);

  useLayoutEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useLayoutEffect(() => {
    prefetchPublicRegionMaskRaster();
    onReadyRef.current?.();
    return () => {
      for (const mat of prepared.materials) disposeMaterial(mat);
    };
  }, [prepared]);

  function atomicFromEvent(event: ThreeEvent<PointerEvent>) {
    return interactionMeshNameToAtomicId(event.object.name);
  }

  function uvFromEvent(event: ThreeEvent<PointerEvent>) {
    const uv = event.uv;
    return uv ? { x: uv.x, y: uv.y } : null;
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (!enabled) return;
    event.stopPropagation();
    const atomicId = atomicFromEvent(event);
    const uv = uvFromEvent(event);
    onHoverPointer?.({ x: event.clientX, y: event.clientY });
    const seq = ++hoverSeq.current;
    void resolvePublicHitFromUv(uv, atomicId).then((hit) => {
      if (seq !== hoverSeq.current) return;
      onHoverAtomicZone(hit.effectiveAtomicId);
    });
  }

  function handlePointerOut() {
    if (!enabled) return;
    hoverSeq.current += 1;
    onHoverAtomicZone(null);
    onHoverPointer?.(null);
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!enabled) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.stopPropagation();
    sessionRef.current = {
      x: event.clientX,
      y: event.clientY,
      atomicId: atomicFromEvent(event),
      uv: uvFromEvent(event),
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
    if (Math.hypot(dx, dy) >= CLICK_DRAG_THRESHOLD_PX) return;

    const atomicId = atomicFromEvent(event) ?? start.atomicId;
    const uv = uvFromEvent(event) ?? start.uv;
    if (!atomicId) return;
    event.stopPropagation();
    void resolvePublicHitFromUv(uv, atomicId).then((hit) => {
      const effective = hit.effectiveAtomicId ?? atomicId;
      if (typeof window !== "undefined") {
        (
          window as unknown as {
            __neutroLastHit?: {
              atomicId: string | null;
              publicTargetId: string | null;
              maskIndex?: number;
              via: string;
            };
          }
        ).__neutroLastHit = {
          atomicId: effective,
          publicTargetId: hit.publicTargetId,
          maskIndex: hit.maskIndex,
          via: "pointer",
        };
      }
      onActivateAtomicZone(effective);
    });
  }

  return (
    <group
      name="NeutroInteractionRoot"
      rotation={rotation}
      scale={[scale, scale, scale]}
    >
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
