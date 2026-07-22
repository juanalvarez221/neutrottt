"use client";

import { useMemo, useState } from "react";
import { Body3DViewer } from "@/widgets/body-3d/Body3DViewer";
import { BodyLabControls } from "@/widgets/body-3d/lab/BodyLabControls";
import {
  AVAILABLE_BODY_MODELS,
  DEFAULT_LAB_BODY_MODEL,
} from "@/widgets/body-3d/lab/availableBodyModels";
import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";
import type {
  ArmDebugVisibility,
  InteractionDebugLayer,
} from "@/widgets/body-3d/domain/bodyZones";

export function BodyLabWorkbench() {
  const [modelId, setModelId] = useState(DEFAULT_LAB_BODY_MODEL.id);
  const [cameraView, setCameraView] = useState<BodyCameraView>("front");
  const [cameraViewToken, setCameraViewToken] = useState(0);
  const [appearance, setAppearance] = useState<BodyAppearanceMode>("original");
  const [wireframe, setWireframe] = useState(false);
  const [showInteractionZones, setShowInteractionZones] = useState(false);
  const [zonesVisualization, setZonesVisualization] = useState<
    "surface" | "edges"
  >("surface");
  const [armVisibility, setArmVisibility] =
    useState<ArmDebugVisibility>("both");
  const [debugLayer, setDebugLayer] =
    useState<InteractionDebugLayer>("arms");

  const activeModel = useMemo(
    () =>
      AVAILABLE_BODY_MODELS.find((entry) => entry.id === modelId) ??
      DEFAULT_LAB_BODY_MODEL,
    [modelId],
  );

  function handleCameraViewChange(view: BodyCameraView) {
    setCameraView(view);
    setCameraViewToken((token) => token + 1);
  }

  function handleModelChange(nextId: string) {
    setModelId(nextId);
    setCameraView("front");
    setCameraViewToken((token) => token + 1);
    setAppearance("original");
    setWireframe(false);
    setShowInteractionZones(false);
    setZonesVisualization("surface");
    setArmVisibility("both");
    setDebugLayer("arms");
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Body3DViewer
          model={activeModel}
          appearance={appearance}
          wireframe={wireframe}
          cameraView={cameraView}
          cameraViewToken={cameraViewToken}
          showInteractionZones={showInteractionZones}
          zonesVisualization={zonesVisualization}
          armVisibility={armVisibility}
          debugLayer={debugLayer}
          height="min(70dvh, 680px)"
        />
        <p className="mt-3 text-center text-xs text-zinc-500 sm:text-left">
          Arrastra para girar · Usa la rueda o gesto de pinza para acercar
        </p>
      </div>

      <BodyLabControls
        models={AVAILABLE_BODY_MODELS}
        activeModel={activeModel}
        onModelChange={handleModelChange}
        cameraView={cameraView}
        onCameraViewChange={handleCameraViewChange}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        wireframe={wireframe}
        onWireframeChange={setWireframe}
        showInteractionZones={showInteractionZones}
        onShowInteractionZonesChange={setShowInteractionZones}
        zonesVisualization={zonesVisualization}
        onZonesVisualizationChange={setZonesVisualization}
        armVisibility={armVisibility}
        onArmVisibilityChange={setArmVisibility}
        debugLayer={debugLayer}
        onDebugLayerChange={setDebugLayer}
      />
    </div>
  );
}
