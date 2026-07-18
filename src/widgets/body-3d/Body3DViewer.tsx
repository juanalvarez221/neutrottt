"use client";

import { Suspense, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HumanBodyModel } from "@/widgets/body-3d/HumanBodyModel";
import { BodyCameraController } from "@/widgets/body-3d/BodyCameraController";
import {
  LAB_CAMERA_DISTANCE,
  LAB_CAMERA_TARGET_Y,
} from "@/widgets/body-3d/bodyModelOrientation";
import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";

const BG = "#17110d";

type ViewerSize = {
  width: number;
  height: number;
};

type Body3DViewerProps = {
  appearance?: BodyAppearanceMode;
  wireframe?: boolean;
  cameraView?: BodyCameraView;
  cameraViewToken?: number;
  className?: string;
  height?: string;
};

function StudioLights() {
  return (
    <>
      {/* Relleno ambiental moderado: evita negros absolutos sin lavar la forma */}
      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#ebe1d4", "#2a2118", 0.38]} />
      {/* Key light principal (estudio cálido) */}
      <directionalLight position={[2.4, 3.8, 2.8]} intensity={1.35} />
      {/* Fill suave opuesto */}
      <directionalLight position={[-2.6, 1.4, 0.8]} intensity={0.42} />
      {/* Rim discreto para leer espalda/volumen */}
      <directionalLight position={[0.2, 2.2, -2.8]} intensity={0.32} />
    </>
  );
}

function BodyScene({
  appearance,
  wireframe,
}: {
  appearance: BodyAppearanceMode;
  wireframe: boolean;
}) {
  return (
    <Center>
      <HumanBodyModel appearance={appearance} wireframe={wireframe} />
    </Center>
  );
}

export function Body3DViewer({
  appearance = "original",
  wireframe = false,
  cameraView = "front",
  cameraViewToken = 0,
  className = "",
  height = "min(72dvh, 720px)",
}: Body3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ViewerSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      };
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener("resize", update);
    // Re-medir tras el primer paint (viewports móviles / HMR).
    const raf = window.requestAnimationFrame(update);
    const timeout = window.setTimeout(update, 120);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, []);

  const canRender = size.width > 0 && size.height > 0;
  const orbitRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <div
      ref={hostRef}
      className={[
        "relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#17110d]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height }}
    >
      {canRender ? (
        <Canvas
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
            position: [0, LAB_CAMERA_TARGET_Y, LAB_CAMERA_DISTANCE],
            fov: 42,
            near: 0.05,
            far: 80,
          }}
        >
          <color attach="background" args={[BG]} />
          <StudioLights />

          <Suspense fallback={null}>
            <BodyScene appearance={appearance} wireframe={wireframe} />
          </Suspense>

          <BodyCameraController
            view={cameraView}
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
            minDistance={1.0}
            maxDistance={3.8}
            minPolarAngle={Math.PI * 0.12}
            maxPolarAngle={Math.PI * 0.88}
            target={[0, LAB_CAMERA_TARGET_Y, 0]}
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
