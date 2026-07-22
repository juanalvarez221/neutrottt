"use client";

import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HumanBodyModel } from "@/widgets/body-3d/HumanBodyModel";
import { BodyCameraController } from "@/widgets/body-3d/BodyCameraController";
import { InteractionZonesDebug } from "@/widgets/body-3d/lab/InteractionZonesDebug";
import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import {
  getCameraLookTarget,
  getCameraPositionForView,
} from "@/widgets/body-3d/cameraViewHelpers";
import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";
import type { ArmDebugVisibility } from "@/widgets/body-3d/domain/bodyZones";

const BG = "#17110d";

type ViewerSize = {
  width: number;
  height: number;
};

type Body3DViewerProps = {
  model: BodyModelDefinition;
  appearance?: BodyAppearanceMode;
  wireframe?: boolean;
  cameraView?: BodyCameraView;
  cameraViewToken?: number;
  showInteractionZones?: boolean;
  zonesVisualization?: "surface" | "edges";
  armVisibility?: ArmDebugVisibility;
  className?: string;
  height?: string;
};

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#ebe1d4", "#2a2118", 0.38]} />
      <directionalLight position={[2.4, 3.8, 2.8]} intensity={1.35} />
      <directionalLight position={[-2.6, 1.4, 0.8]} intensity={0.42} />
      <directionalLight position={[0.2, 2.2, -2.8]} intensity={0.32} />
    </>
  );
}

function BodyScene({
  model,
  appearance,
  wireframe,
  showInteractionZones,
  zonesVisualization,
  armVisibility,
}: {
  model: BodyModelDefinition;
  appearance: BodyAppearanceMode;
  wireframe: boolean;
  showInteractionZones: boolean;
  zonesVisualization: "surface" | "edges";
  armVisibility: ArmDebugVisibility;
}) {
  const canShowZones =
    showInteractionZones && model.role === "production";

  return (
    <Center>
      <HumanBodyModel
        model={model}
        appearance={appearance}
        wireframe={wireframe}
      />
      {canShowZones ? (
        <InteractionZonesDebug
          rotation={model.rotation}
          scale={model.scale ?? 1}
          visualization={zonesVisualization}
          armVisibility={armVisibility}
        />
      ) : null}
    </Center>
  );
}

function readHostSize(host: HTMLElement): ViewerSize {
  const rect = host.getBoundingClientRect();
  return {
    width: Math.max(
      0,
      Math.floor(rect.width || host.clientWidth || host.offsetWidth),
    ),
    height: Math.max(
      0,
      Math.floor(rect.height || host.clientHeight || host.offsetHeight),
    ),
  };
}

export function Body3DViewer({
  model,
  appearance = "original",
  wireframe = false,
  cameraView = "front",
  cameraViewToken = 0,
  showInteractionZones = false,
  zonesVisualization = "surface",
  armVisibility = "both",
  className = "",
  height = "min(72dvh, 720px)",
}: Body3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [size, setSize] = useState<ViewerSize>({ width: 0, height: 0 });

  const initialCameraPosition = useMemo(
    () => getCameraPositionForView("front", model.camera),
    [model.camera],
  );
  const lookTarget = useMemo(
    () => getCameraLookTarget(model.camera),
    [model.camera],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const next = readHostSize(host);
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener("resize", update);

    const timers = [0, 50, 150, 400].map((ms) => window.setTimeout(update, ms));
    const raf = window.requestAnimationFrame(update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.cancelAnimationFrame(raf);
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  useLayoutEffect(() => {
    void useGLTF.preload(model.src);
  }, [model.src]);

  const canRender = size.width > 0 && size.height > 0;
  const minDistance = model.camera.minDistance ?? model.camera.distance * 0.55;
  const maxDistance = model.camera.maxDistance ?? model.camera.distance * 2.1;

  return (
    <div
      ref={hostRef}
      className={[
        "relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#17110d]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height, width: "100%" }}
    >
      {canRender ? (
        <Canvas
          key={model.id}
          dpr={[1, 1.75]}
          style={{
            width: size.width,
            height: size.height,
            display: "block",
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "default",
          }}
          camera={{
            position: [
              initialCameraPosition.x,
              initialCameraPosition.y,
              initialCameraPosition.z,
            ],
            fov: 42,
            near: 0.05,
            far: 80,
          }}
        >
          <color attach="background" args={[BG]} />
          <StudioLights />

          <Suspense fallback={null}>
            <BodyScene
              model={model}
              appearance={appearance}
              wireframe={wireframe}
              showInteractionZones={showInteractionZones}
              zonesVisualization={zonesVisualization}
              armVisibility={armVisibility}
            />
          </Suspense>

          <BodyCameraController
            view={cameraView}
            framing={model.camera}
            viewToken={cameraViewToken}
            orbitRef={orbitRef}
          />

          <OrbitControls
            ref={orbitRef}
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.72}
            zoomSpeed={0.85}
            minDistance={minDistance}
            maxDistance={maxDistance}
            minPolarAngle={Math.PI * 0.12}
            maxPolarAngle={Math.PI * 0.88}
            target={[lookTarget.x, lookTarget.y, lookTarget.z]}
          />
        </Canvas>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            Cargando visor…
          </p>
        </div>
      )}
    </div>
  );
}
