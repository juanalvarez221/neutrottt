"use client";

import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HumanBodyModel } from "@/widgets/body-3d/HumanBodyModel";
import { BodyCameraController } from "@/widgets/body-3d/BodyCameraController";
import { InteractionZonesDebug } from "@/widgets/body-3d/lab/InteractionZonesDebug";
import {
  BodyInteractionModel,
  BodyPublicRegionHighlight,
  BodyZoneHighlight,
} from "@/widgets/body-3d/interaction";
import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import {
  getCameraPositionForView,
  type BodyCameraFraming,
} from "@/widgets/body-3d/cameraViewHelpers";
import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";
import type {
  ArmDebugVisibility,
  BodyRegionFilter,
  InteractionDebugLayer,
} from "@/widgets/body-3d/domain/bodyZones";
import { BODY_81_INTERACTION_MODEL_SRC } from "@/widgets/body-3d/domain/bodyZones";
import { BodyAutoFit } from "@/widgets/body-3d/ux/BodyAutoFit";
import type { CameraFocusPose } from "@/widgets/body-3d/ux/bodyCameraFocus";
import {
  verticalFillForViewport,
  type FittedBodyFraming,
} from "@/widgets/body-3d/ux/bodyFitFraming";

const BG = "#17110d";
const CAMERA_FOV = 42;

/** off | debug zones | technical interaction | premium UX */
export type LabInteractionMode = "off" | "debug" | "interaction" | "premium";

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
  debugLayer?: InteractionDebugLayer;
  regionFilter?: BodyRegionFilter;
  labInteractionMode?: LabInteractionMode;
  hoveredAtomicZoneId?: string | null;
  previewAtomicZoneIds?: readonly string[];
  selectedAtomicZoneIds?: readonly string[];
  /** Highlights del PublicRegionHighlightModel (premium). */
  previewPublicRegionIds?: readonly string[];
  selectedPublicRegionIds?: readonly string[];
  onHoverAtomicZone?: (atomicId: string | null) => void;
  onHoverPointer?: (point: { x: number; y: number } | null) => void;
  onActivateAtomicZone?: (atomicId: string) => void;
  focusPose?: CameraFocusPose | null;
  focusToken?: number;
  reducedMotion?: boolean;
  /** Si false, el host no aplica borde/radio (chrome del shell premium). */
  chrome?: boolean;
  /** InteractionModel listo para raycast. */
  onInteractionReady?: () => void;
  /** Framing de cuerpo completo calculado por bbox (para focus/reset del padre). */
  onFitFraming?: (framing: FittedBodyFraming) => void;
  /** Activa auto-fit por bounding box del BodyVisual. */
  autoFit?: boolean;
  /** Texto de carga (producción / lab). */
  loadingLabel?: string;
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

function isSpatialInteraction(mode: LabInteractionMode) {
  return mode === "interaction" || mode === "premium";
}

function BodyScene({
  model,
  appearance,
  wireframe,
  showInteractionZones,
  zonesVisualization,
  armVisibility,
  debugLayer,
  regionFilter,
  labInteractionMode,
  hoveredAtomicZoneId,
  previewAtomicZoneIds,
  selectedAtomicZoneIds,
  previewPublicRegionIds,
  selectedPublicRegionIds,
  onHoverAtomicZone,
  onHoverPointer,
  onActivateAtomicZone,
  onInteractionReady,
  autoFit,
  verticalFill,
  fitToken,
  onFit,
}: {
  model: BodyModelDefinition;
  appearance: BodyAppearanceMode;
  wireframe: boolean;
  showInteractionZones: boolean;
  zonesVisualization: "surface" | "edges";
  armVisibility: ArmDebugVisibility;
  debugLayer: InteractionDebugLayer;
  regionFilter: BodyRegionFilter;
  labInteractionMode: LabInteractionMode;
  hoveredAtomicZoneId: string | null;
  previewAtomicZoneIds: readonly string[];
  selectedAtomicZoneIds: readonly string[];
  previewPublicRegionIds: readonly string[];
  selectedPublicRegionIds: readonly string[];
  onHoverAtomicZone: (atomicId: string | null) => void;
  onHoverPointer: (point: { x: number; y: number } | null) => void;
  onActivateAtomicZone: (atomicId: string) => void;
  onInteractionReady?: () => void;
  autoFit: boolean;
  verticalFill: number;
  fitToken: number;
  onFit: (framing: FittedBodyFraming) => void;
}) {
  const isProduction = model.role === "production";
  const showDebug =
    isProduction && showInteractionZones && labInteractionMode === "debug";
  const showInteraction =
    isProduction && isSpatialInteraction(labInteractionMode);
  const usePublicHighlight = labInteractionMode === "premium";

  const content = (
    <Center>
      <HumanBodyModel
        model={model}
        appearance={appearance}
        wireframe={wireframe}
        raycastEnabled={!showInteraction}
      />
      {showDebug ? (
        <InteractionZonesDebug
          rotation={model.rotation}
          scale={model.scale ?? 1}
          visualization={zonesVisualization}
          armVisibility={armVisibility}
          debugLayer={debugLayer}
          regionFilter={regionFilter}
        />
      ) : null}
      {showInteraction ? (
        <>
          {usePublicHighlight ? (
            <BodyPublicRegionHighlight
              rotation={model.rotation}
              scale={model.scale ?? 1}
              previewPublicRegionIds={previewPublicRegionIds}
              selectedPublicRegionIds={selectedPublicRegionIds}
            />
          ) : (
            <BodyZoneHighlight
              rotation={model.rotation}
              scale={model.scale ?? 1}
              hoveredAtomicZoneId={hoveredAtomicZoneId}
              previewAtomicZoneIds={previewAtomicZoneIds}
              selectedAtomicZoneIds={selectedAtomicZoneIds}
            />
          )}
          <BodyInteractionModel
            rotation={model.rotation}
            scale={model.scale ?? 1}
            enabled
            onHoverAtomicZone={onHoverAtomicZone}
            onHoverPointer={onHoverPointer}
            onActivateAtomicZone={onActivateAtomicZone}
            onReady={onInteractionReady}
          />
        </>
      ) : null}
    </Center>
  );

  if (!autoFit) return content;

  return (
    <BodyAutoFit
      enabled
      verticalFill={verticalFill}
      fitToken={fitToken}
      onFit={onFit}
    >
      {content}
    </BodyAutoFit>
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
  debugLayer = "arms",
  regionFilter = "all",
  labInteractionMode = "off",
  hoveredAtomicZoneId = null,
  previewAtomicZoneIds = [],
  selectedAtomicZoneIds = [],
  previewPublicRegionIds = [],
  selectedPublicRegionIds = [],
  onHoverAtomicZone,
  onHoverPointer,
  onActivateAtomicZone,
  focusPose = null,
  focusToken = 0,
  reducedMotion = false,
  chrome = true,
  onInteractionReady,
  onFitFraming,
  autoFit = true,
  loadingLabel = "Cargando visor…",
  className = "",
  height = "min(72dvh, 720px)",
}: Body3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [size, setSize] = useState<ViewerSize>({ width: 0, height: 0 });
  const [fitFraming, setFitFraming] = useState<FittedBodyFraming | null>(null);
  const [fitToken, setFitToken] = useState(0);

  const activeFraming: BodyCameraFraming = fitFraming ?? model.camera;

  const initialCameraPosition = useMemo(
    () => getCameraPositionForView("front", model.camera),
    [model.camera],
  );

  const verticalFill = verticalFillForViewport(size.width || 1024);

  const handleFit = useCallback(
    (framing: FittedBodyFraming) => {
      setFitFraming(framing);
      onFitFraming?.(framing);
    },
    [onFitFraming],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const next = readHostSize(host);
      if (next.width <= 0) {
        next.width = Math.max(
          host.offsetWidth,
          host.parentElement?.clientWidth ?? 0,
          320,
        );
      }
      if (next.height <= 0) {
        next.height = Math.max(host.offsetHeight, 360);
      }

      setSize((prev) => {
        if (prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        if (autoFit && prev.width > 0) {
          queueMicrotask(() => setFitToken((t) => t + 1));
        }
        return next;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener("resize", update);

    const timers = [0, 50, 150, 400, 1000].map((ms) =>
      window.setTimeout(update, ms),
    );
    const raf = window.requestAnimationFrame(update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.cancelAnimationFrame(raf);
      for (const id of timers) window.clearTimeout(id);
    };
  }, [autoFit]);

  useLayoutEffect(() => {
    void useGLTF.preload(model.src);
    if (isSpatialInteraction(labInteractionMode)) {
      void useGLTF.preload(BODY_81_INTERACTION_MODEL_SRC);
    }
  }, [labInteractionMode, model.src]);

  const canRender = size.width > 0 && size.height > 0;
  const fitReady = !autoFit || fitFraming !== null;
  const minDistance =
    fitFraming?.minDistance ??
    model.camera.minDistance ??
    model.camera.distance * 0.55;
  const maxDistance =
    fitFraming?.maxDistance ??
    model.camera.maxDistance ??
    model.camera.distance * 2.1;

  return (
    <div
      ref={hostRef}
      className={[
        "relative w-full overflow-hidden bg-[#17110d]",
        chrome ? "rounded-2xl border border-white/10" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height, width: "100%", minHeight: 360 }}
    >
      {canRender ? (
        <Canvas
          key={model.id}
          dpr={[1, 1.75]}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            opacity: fitReady ? 1 : 0,
            transition: reducedMotion ? undefined : "opacity 160ms ease-out",
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
            fov: CAMERA_FOV,
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
              debugLayer={debugLayer}
              regionFilter={regionFilter}
              labInteractionMode={labInteractionMode}
              hoveredAtomicZoneId={hoveredAtomicZoneId}
              previewAtomicZoneIds={previewAtomicZoneIds}
              selectedAtomicZoneIds={selectedAtomicZoneIds}
              previewPublicRegionIds={previewPublicRegionIds}
              selectedPublicRegionIds={selectedPublicRegionIds}
              onHoverAtomicZone={onHoverAtomicZone ?? (() => undefined)}
              onHoverPointer={onHoverPointer ?? (() => undefined)}
              onActivateAtomicZone={onActivateAtomicZone ?? (() => undefined)}
              onInteractionReady={onInteractionReady}
              autoFit={autoFit}
              verticalFill={verticalFill}
              fitToken={fitToken}
              onFit={handleFit}
            />
          </Suspense>

          <BodyCameraController
            view={cameraView}
            framing={activeFraming}
            viewToken={cameraViewToken}
            orbitRef={orbitRef}
            focusPose={focusPose}
            focusToken={focusToken}
            reducedMotion={reducedMotion}
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
            // No pasar `target` controlado: pelea con BodyCameraController
            // y puede dejar la órbita en un frontal-diagonal al enfocar espalda.
          />
        </Canvas>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            {loadingLabel}
          </p>
        </div>
      )}
    </div>
  );
}
