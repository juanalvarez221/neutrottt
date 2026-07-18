"use client";

import { Suspense, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls } from "@react-three/drei";
import { HumanBodyModel } from "@/widgets/body-3d/HumanBodyModel";

const BG = "#17110d";

type ViewerSize = {
  width: number;
  height: number;
};

function StudioLights() {
  return (
    <>
      <ambientLight intensity={1.05} />
      <hemisphereLight args={["#f5efe6", "#241c15", 0.7]} />
      <directionalLight position={[3.0, 4.5, 2.5]} intensity={1.55} />
      <directionalLight position={[-3.2, 2.0, -1.5]} intensity={0.65} />
      <directionalLight position={[0.2, 1.8, -3.2]} intensity={0.5} />
    </>
  );
}

function BodyScene() {
  return (
    <Center>
      <HumanBodyModel />
    </Center>
  );
}

export function Body3DViewer() {
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
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const canRender = size.width > 0 && size.height > 0;

  return (
    <div
      ref={hostRef}
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#17110d]"
      style={{ height: "min(72dvh, 720px)" }}
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
          camera={{ position: [0, 0.05, 1.85], fov: 42, near: 0.05, far: 80 }}
        >
          <color attach="background" args={[BG]} />
          <StudioLights />

          <Suspense fallback={null}>
            <BodyScene />
          </Suspense>

          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.72}
            zoomSpeed={0.85}
            minDistance={1.0}
            maxDistance={3.8}
            minPolarAngle={Math.PI * 0.15}
            maxPolarAngle={Math.PI * 0.85}
            target={[0, 0, 0]}
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
