"use client";

import { useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import {
  DoubleSide,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import {
  BODY_81_INTERACTION_MODEL_SRC,
  DETAILED_ARMS_INTERACTION_MODEL_SRC,
  DETAILED_LEGS_INTERACTION_MODEL_SRC,
  HEAD_NECK_INTERACTION_MODEL_SRC,
  LEGS_G1_INTERACTION_MODEL_SRC,
  LEGS_G2_INTERACTION_MODEL_SRC,
  LEGS_L1_INTERACTION_MODEL_SRC,
  LEGS_L2_INTERACTION_MODEL_SRC,
  TORSO_PELVIS_FINAL_INTERACTION_MODEL_SRC,
  TORSO_PELVIS_P1_INTERACTION_MODEL_SRC,
  TORSO_PELVIS_P2_INTERACTION_MODEL_SRC,
  TORSO_T1_INTERACTION_MODEL_SRC,
  TORSO_T2_INTERACTION_MODEL_SRC,
  type ArmDebugVisibility,
  type BodyRegionFilter,
  type InteractionDebugLayer,
} from "@/widgets/body-3d/domain/bodyZones";

type InteractionZonesDebugProps = Omit<ThreeElements["group"], "children"> & {
  rotation?: [number, number, number];
  scale?: number;
  visualization?: "surface" | "edges";
  armVisibility?: ArmDebugVisibility;
  debugLayer?: InteractionDebugLayer;
  regionFilter?: BodyRegionFilter;
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

function regionVisible(name: string, filter: BodyRegionFilter): boolean {
  if (filter === "all") return true;
  const n = name.toLowerCase();
  if (filter === "arms") {
    return (
      n.includes("upper_arm") ||
      n.includes("forearm") ||
      n.includes("elbow") ||
      n.includes("wrist") ||
      n.includes("hand") ||
      n.includes("shoulder")
    );
  }
  if (filter === "legs") {
    return (
      n.includes("thigh") ||
      n.includes("knee") ||
      n.includes("lower_leg") ||
      n.includes("ankle") ||
      n.includes("foot")
    );
  }
  if (filter === "head_neck") {
    return (
      n.includes("neck_") ||
      n.includes("face_") ||
      n.includes("head_") ||
      n.includes("_ear")
    );
  }
  // torso_pelvis
  return !(
    n.includes("upper_arm") ||
    n.includes("forearm") ||
    n.includes("elbow") ||
    n.includes("wrist") ||
    n.includes("hand") ||
    n.includes("shoulder") ||
    n.includes("thigh") ||
    n.includes("knee") ||
    n.includes("lower_leg") ||
    n.includes("ankle") ||
    n.includes("foot") ||
    n.includes("neck_") ||
    n.includes("face_") ||
    n.includes("head_") ||
    n.includes("_ear")
  );
}

function prepareScene(
  scene: Object3D,
  visualization: "surface" | "edges",
  filter?: (name: string) => boolean,
) {
  const cloned = scene.clone(true);
  const materials: Material[] = [];

  cloned.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = filter ? filter(mesh.name) : true;

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
}

function InteractionGlbLayer({
  src,
  visualization,
  filter,
}: {
  src: string;
  visualization: "surface" | "edges";
  filter?: (name: string) => boolean;
}) {
  const { scene } = useGLTF(src);
  const prepared = useMemo(
    () => prepareScene(scene, visualization, filter),
    [scene, visualization, filter],
  );

  useLayoutEffect(() => {
    return () => {
      for (const mat of prepared.materials) {
        disposeMaterial(mat);
      }
    };
  }, [prepared]);

  return <primitive object={prepared.cloned} />;
}

export function InteractionZonesDebug({
  rotation = [0, 0, 0],
  scale = 1,
  visualization = "surface",
  armVisibility = "both",
  debugLayer = "arms",
  regionFilter = "all",
  ...props
}: InteractionZonesDebugProps) {
  const showBodyMap =
    debugLayer === "body_69" || debugLayer === "body_81";
  const showHeadNeck = debugLayer === "head_neck";
  const showDetailedLegs = !showBodyMap && debugLayer === "detailed_legs";
  const showArms =
    !showBodyMap &&
    !showHeadNeck &&
    !showDetailedLegs &&
    (debugLayer === "arms" ||
      debugLayer === "arms_and_torso_pelvis_p2" ||
      debugLayer === "arms_and_torso_pelvis_final" ||
      debugLayer === "central_plus_arms_legs_l1" ||
      debugLayer === "central_plus_arms_legs_l2" ||
      debugLayer === "central_plus_arms_legs_g1" ||
      debugLayer === "central_plus_arms_legs_g2");
  const showTorsoT1 = !showBodyMap && !showHeadNeck && debugLayer === "torso_t1";
  const showTorsoT2 = !showBodyMap && !showHeadNeck && debugLayer === "torso_t2";
  const showPelvisP1 =
    !showBodyMap && !showHeadNeck && debugLayer === "torso_pelvis_p1";
  const showPelvisP2 =
    !showBodyMap &&
    !showHeadNeck &&
    (debugLayer === "torso_pelvis_p2" ||
      debugLayer === "arms_and_torso_pelvis_p2");
  const showPelvisFinal =
    !showBodyMap &&
    !showHeadNeck &&
    (debugLayer === "torso_pelvis_final" ||
      debugLayer === "arms_and_torso_pelvis_final" ||
      debugLayer === "central_plus_arms_legs_l1" ||
      debugLayer === "central_plus_arms_legs_l2" ||
      debugLayer === "central_plus_arms_legs_g1" ||
      debugLayer === "central_plus_arms_legs_g2");
  const showLegsL1 =
    !showBodyMap &&
    !showHeadNeck &&
    (debugLayer === "legs_l1" || debugLayer === "central_plus_arms_legs_l1");
  const showLegsL2 =
    !showBodyMap &&
    !showHeadNeck &&
    (debugLayer === "legs_l2" || debugLayer === "central_plus_arms_legs_l2");
  const showLegsG1 =
    !showBodyMap &&
    !showHeadNeck &&
    (debugLayer === "legs_g1" || debugLayer === "central_plus_arms_legs_g1");
  const showLegsG2 =
    !showBodyMap &&
    !showHeadNeck &&
    !showDetailedLegs &&
    (debugLayer === "legs_g2" || debugLayer === "central_plus_arms_legs_g2");

  const armFilter = useMemo(
    () => (name: string) => sideVisible(name, armVisibility),
    [armVisibility],
  );

  const bodyMapFilter = useMemo(
    () => (name: string) => regionVisible(name, regionFilter),
    [regionFilter],
  );

  return (
    <group {...props} rotation={rotation} scale={[scale, scale, scale]}>
      {showBodyMap ? (
        <InteractionGlbLayer
          src={BODY_81_INTERACTION_MODEL_SRC}
          visualization={visualization}
          filter={bodyMapFilter}
        />
      ) : null}
      {showHeadNeck ? (
        <InteractionGlbLayer
          src={HEAD_NECK_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showDetailedLegs ? (
        <InteractionGlbLayer
          src={DETAILED_LEGS_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showArms ? (
        <InteractionGlbLayer
          src={DETAILED_ARMS_INTERACTION_MODEL_SRC}
          visualization={visualization}
          filter={armFilter}
        />
      ) : null}
      {showTorsoT1 ? (
        <InteractionGlbLayer
          src={TORSO_T1_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showTorsoT2 ? (
        <InteractionGlbLayer
          src={TORSO_T2_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showPelvisP1 ? (
        <InteractionGlbLayer
          src={TORSO_PELVIS_P1_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showPelvisP2 ? (
        <InteractionGlbLayer
          src={TORSO_PELVIS_P2_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showPelvisFinal ? (
        <InteractionGlbLayer
          src={TORSO_PELVIS_FINAL_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showLegsL1 ? (
        <InteractionGlbLayer
          src={LEGS_L1_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showLegsL2 ? (
        <InteractionGlbLayer
          src={LEGS_L2_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showLegsG1 ? (
        <InteractionGlbLayer
          src={LEGS_G1_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
      {showLegsG2 ? (
        <InteractionGlbLayer
          src={LEGS_G2_INTERACTION_MODEL_SRC}
          visualization={visualization}
        />
      ) : null}
    </group>
  );
}

useGLTF.preload(DETAILED_ARMS_INTERACTION_MODEL_SRC);
useGLTF.preload(TORSO_T1_INTERACTION_MODEL_SRC);
useGLTF.preload(TORSO_T2_INTERACTION_MODEL_SRC);
useGLTF.preload(TORSO_PELVIS_P1_INTERACTION_MODEL_SRC);
useGLTF.preload(TORSO_PELVIS_P2_INTERACTION_MODEL_SRC);
useGLTF.preload(TORSO_PELVIS_FINAL_INTERACTION_MODEL_SRC);
useGLTF.preload(LEGS_L1_INTERACTION_MODEL_SRC);
useGLTF.preload(LEGS_L2_INTERACTION_MODEL_SRC);
useGLTF.preload(LEGS_G1_INTERACTION_MODEL_SRC);
useGLTF.preload(LEGS_G2_INTERACTION_MODEL_SRC);
useGLTF.preload(DETAILED_LEGS_INTERACTION_MODEL_SRC);
useGLTF.preload(BODY_81_INTERACTION_MODEL_SRC);
useGLTF.preload(HEAD_NECK_INTERACTION_MODEL_SRC);
