"use client";

import { useMemo, useState } from "react";
import {
  Body3DViewer,
  type LabInteractionMode,
} from "@/widgets/body-3d/Body3DViewer";
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
  BodyRegionFilter,
  InteractionDebugLayer,
} from "@/widgets/body-3d/domain/bodyZones";
import {
  addSelectionTarget,
  BodyInteractionLabPanel,
  clearSelectionTargets,
  getSelectionDisplayLabel,
  getSelectionOptionsForAtomicZone,
  removeSelectionTarget,
  resolveSelectedAtomicZoneIds,
} from "@/widgets/body-3d/interaction";
import { BodyPremiumSelector } from "@/widgets/body-3d/ux/BodyPremiumSelector";

export type LabExperienceMode = "premium" | "technical";

export function BodyLabWorkbench() {
  const [labExperience, setLabExperience] =
    useState<LabExperienceMode>("premium");
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
    useState<InteractionDebugLayer>("body_81");
  const [regionFilter, setRegionFilter] = useState<BodyRegionFilter>("all");
  const [labInteractionMode, setLabInteractionMode] =
    useState<LabInteractionMode>("interaction");

  const [hoveredAtomicZoneId, setHoveredAtomicZoneId] = useState<string | null>(
    null,
  );
  const [activeAtomicZoneId, setActiveAtomicZoneId] = useState<string | null>(
    null,
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  const resolvedSelectedAtomicZoneIds = useMemo(
    () => resolveSelectedAtomicZoneIds(selectedTargetIds),
    [selectedTargetIds],
  );

  const contextualOptions = useMemo(
    () =>
      activeAtomicZoneId
        ? getSelectionOptionsForAtomicZone(activeAtomicZoneId)
        : [],
    [activeAtomicZoneId],
  );

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
    setDebugLayer("body_81");
    setRegionFilter("all");
    setLabInteractionMode("interaction");
    setHoveredAtomicZoneId(null);
    setActiveAtomicZoneId(null);
    setSelectedTargetIds([]);
  }

  function handleLabModeChange(mode: LabInteractionMode) {
    setLabInteractionMode(mode);
    if (mode === "debug") {
      setShowInteractionZones(true);
    }
    if (mode === "off") {
      setShowInteractionZones(false);
      setHoveredAtomicZoneId(null);
      setActiveAtomicZoneId(null);
    }
    if (mode === "interaction" || mode === "premium") {
      setShowInteractionZones(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Modo de laboratorio"
        className="flex flex-wrap gap-2"
      >
        {(
          [
            {
              id: "premium" as const,
              label: "Premium UX Prototype",
              hint: "Experiencia de cotización",
            },
            {
              id: "technical" as const,
              label: "Technical Debug",
              hint: "Zonas, IDs y panel técnico",
            },
          ] as const
        ).map((tab) => {
          const active = labExperience === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLabExperience(tab.id)}
              className={[
                "min-h-11 rounded-xl border px-4 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]",
                active
                  ? "border-[rgba(232,168,64,0.4)] bg-[rgba(232,168,64,0.14)] text-[rgba(255,236,210,0.96)]"
                  : "border-white/10 bg-black/30 text-zinc-400 hover:border-white/16 hover:text-zinc-200",
              ].join(" ")}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-[11px] opacity-70">
                {tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      {labExperience === "premium" ? (
        <BodyPremiumSelector model={activeModel} />
      ) : (
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
              regionFilter={regionFilter}
              labInteractionMode={labInteractionMode}
              hoveredAtomicZoneId={hoveredAtomicZoneId}
              selectedAtomicZoneIds={resolvedSelectedAtomicZoneIds}
              onHoverAtomicZone={setHoveredAtomicZoneId}
              onActivateAtomicZone={setActiveAtomicZoneId}
              height="min(70dvh, 680px)"
            />
            <p className="mt-3 text-center text-xs text-zinc-500 sm:text-left">
              {labInteractionMode === "interaction"
                ? "Arrastra para girar · Tap/click para opciones · Pellizca para zoom"
                : "Arrastra para girar · Usa la rueda o gesto de pinza para acercar"}
            </p>
            {labInteractionMode === "interaction" && hoveredAtomicZoneId ? (
              <p className="mt-1 text-center text-sm font-medium text-stone-300 sm:text-left">
                {getSelectionDisplayLabel(hoveredAtomicZoneId)}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:shrink-0">
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
              regionFilter={regionFilter}
              onRegionFilterChange={setRegionFilter}
              labInteractionMode={labInteractionMode}
              onLabInteractionModeChange={handleLabModeChange}
            />

            {labInteractionMode === "interaction" ? (
              <BodyInteractionLabPanel
                hoveredAtomicZoneId={hoveredAtomicZoneId}
                activeAtomicZoneId={activeAtomicZoneId}
                options={contextualOptions}
                selectedTargetIds={selectedTargetIds}
                onSelectOption={(targetId) => {
                  setSelectedTargetIds((prev) =>
                    addSelectionTarget(prev, targetId),
                  );
                  setActiveAtomicZoneId(null);
                }}
                onRemoveTarget={(targetId) => {
                  setSelectedTargetIds((prev) =>
                    removeSelectionTarget(prev, targetId),
                  );
                }}
                onClearSelection={() => {
                  setSelectedTargetIds(clearSelectionTargets());
                }}
                onCloseActive={() => setActiveAtomicZoneId(null)}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
