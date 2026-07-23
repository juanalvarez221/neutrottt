/**
 * Prototipo UX premium del selector corporal 3D (lab).
 * Model-first · progressive disclosure · desktop panel + mobile sheet.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Body3DViewer } from "@/widgets/body-3d/Body3DViewer";
import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";
import {
  addSelectionTarget,
  clearSelectionTargets,
  getSelectionOptionsForAtomicZone,
  removeSelectionTarget,
  resolveSelectedAtomicZoneIds,
} from "@/widgets/body-3d/interaction";
import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import {
  getCameraFocusForAtomicZone,
  getFullBodyCameraPose,
  type CameraFocusPose,
} from "@/widgets/body-3d/ux/bodyCameraFocus";
import { findContainingSelections } from "@/widgets/body-3d/ux/bodyContainedSelection";
import { BodyContextOptions } from "@/widgets/body-3d/ux/BodyContextOptions";
import { BodyHoverTooltip } from "@/widgets/body-3d/ux/BodyHoverTooltip";
import {
  BodyMobileSheet,
  type MobileSheetState,
} from "@/widgets/body-3d/ux/BodyMobileSheet";
import { BodySelectionSummary } from "@/widgets/body-3d/ux/BodySelectionSummary";
import { BodyViewControls } from "@/widgets/body-3d/ux/BodyViewControls";
import { splitZoneLabel } from "@/widgets/body-3d/ux/bodyUxCopy";

type BodyPremiumSelectorProps = {
  model: BodyModelDefinition;
};

export function BodyPremiumSelector({ model }: BodyPremiumSelectorProps) {
  const [cameraView, setCameraView] = useState<BodyCameraView>("front");
  const [cameraViewToken, setCameraViewToken] = useState(0);
  const [hoveredAtomicZoneId, setHoveredAtomicZoneId] = useState<string | null>(
    null,
  );
  const [activeAtomicZoneId, setActiveAtomicZoneId] = useState<string | null>(
    null,
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);
  const [hoverPointer, setHoverPointer] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [sheetState, setSheetState] = useState<MobileSheetState>("closed");
  const [focusPose, setFocusPose] = useState<CameraFocusPose | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [cameraFocused, setCameraFocused] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showContainedOverride, setShowContainedOverride] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setIsCoarsePointer(mq.matches);
      setReducedMotion(rm.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    rm.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      rm.removeEventListener("change", sync);
    };
  }, []);

  const resolvedSelectedAtomicZoneIds = useMemo(
    () => resolveSelectedAtomicZoneIds(selectedTargetIds),
    [selectedTargetIds],
  );

  const previewAtomicZoneIds = useMemo(
    () =>
      previewTargetId ? resolveTargetToAtomicZoneIds(previewTargetId) : [],
    [previewTargetId],
  );

  const contextualOptions = useMemo(
    () =>
      activeAtomicZoneId
        ? getSelectionOptionsForAtomicZone(activeAtomicZoneId)
        : [],
    [activeAtomicZoneId],
  );

  const contained = useMemo(() => {
    if (!activeAtomicZoneId || showContainedOverride) return [];
    return findContainingSelections(activeAtomicZoneId, selectedTargetIds);
  }, [activeAtomicZoneId, selectedTargetIds, showContainedOverride]);

  const activeParts = activeAtomicZoneId
    ? splitZoneLabel(activeAtomicZoneId)
    : null;

  function markInteracted() {
    setHasInteracted(true);
  }

  function handleCameraViewChange(view: BodyCameraView) {
    setCameraView(view);
    setCameraViewToken((t) => t + 1);
    setFocusPose(null);
    setCameraFocused(false);
    setFocusToken((t) => t + 1);
  }

  function handleResetFullBody() {
    setFocusPose(getFullBodyCameraPose(model.camera));
    setCameraView("front");
    setCameraViewToken((t) => t + 1);
    setFocusToken((t) => t + 1);
    setCameraFocused(false);
  }

  function handleActivateZone(atomicId: string) {
    markInteracted();
    setActiveAtomicZoneId(atomicId);
    setShowContainedOverride(false);
    setPreviewTargetId(null);
    setSheetState("peek");

    const pose = getCameraFocusForAtomicZone(atomicId, model.camera);
    setFocusPose(pose);
    setFocusToken((t) => t + 1);
    setCameraFocused(true);
  }

  function handleSelectOption(targetId: string) {
    setSelectedTargetIds((prev) => addSelectionTarget(prev, targetId));
    setActiveAtomicZoneId(null);
    setPreviewTargetId(null);
    setSheetState("closed");
    setShowContainedOverride(false);
  }

  function handleCloseActive() {
    setActiveAtomicZoneId(null);
    setPreviewTargetId(null);
    setSheetState("closed");
    setShowContainedOverride(false);
  }

  const showDesktopTooltip =
    !isCoarsePointer &&
    Boolean(hoveredAtomicZoneId) &&
    hoveredAtomicZoneId !== activeAtomicZoneId;

  const contextPanel = activeAtomicZoneId ? (
    <BodyContextOptions
      activeAtomicZoneId={activeAtomicZoneId}
      options={contextualOptions}
      contained={contained}
      selectedTargetIds={selectedTargetIds}
      onSelectOption={handleSelectOption}
      onPreviewOption={setPreviewTargetId}
      onRemoveContained={(targetId) => {
        setSelectedTargetIds((prev) => removeSelectionTarget(prev, targetId));
      }}
      onChangeSelection={() => setShowContainedOverride(true)}
      enablePreview={!isCoarsePointer}
    />
  ) : null;

  return (
    <div className="relative flex min-h-[min(82dvh,760px)] flex-col gap-3">
      <div className="relative h-[min(82dvh,760px)] min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#17110d]">
        <Body3DViewer
          model={model}
          appearance="original"
          wireframe={false}
          cameraView={cameraView}
          cameraViewToken={cameraViewToken}
          labInteractionMode="premium"
          hoveredAtomicZoneId={hoveredAtomicZoneId}
          previewAtomicZoneIds={previewAtomicZoneIds}
          selectedAtomicZoneIds={resolvedSelectedAtomicZoneIds}
          onHoverAtomicZone={(id) => {
            setHoveredAtomicZoneId(id);
            if (id) markInteracted();
          }}
          onHoverPointer={setHoverPointer}
          onActivateAtomicZone={handleActivateZone}
          focusPose={focusPose}
          focusToken={focusToken}
          reducedMotion={reducedMotion}
          className="!rounded-none !border-0"
          height="100%"
          chrome={false}
        />

        {/* Intro hint */}
        {!hasInteracted ? (
          <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center px-4 md:top-8 md:justify-start md:pl-8">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-[rgba(23,17,13,0.72)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
              <p className="text-base font-semibold tracking-tight text-[rgba(255,242,228,0.96)]">
                ¿Dónde quieres tatuarte?
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Gira el cuerpo y toca una zona. Puedes elegir una superficie
                puntual o una región completa.
              </p>
            </div>
          </div>
        ) : null}

        {/* Desktop floating context */}
        {activeAtomicZoneId && activeParts ? (
          <aside
            className="pointer-events-none absolute right-4 top-4 z-20 hidden w-[min(100%,20rem)] md:pointer-events-auto md:block"
            aria-live="polite"
          >
            <div className="rounded-2xl border border-white/12 bg-[rgba(23,17,13,0.9)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-opacity duration-200">
              {contextPanel}
              <button
                type="button"
                onClick={handleCloseActive}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 text-xs font-semibold text-zinc-400 transition hover:bg-black/30 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
              >
                Cerrar
              </button>
            </div>
          </aside>
        ) : null}

        {/* View controls */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 md:bottom-5">
          <div className="pointer-events-auto">
            <BodyViewControls
              cameraView={cameraView}
              onCameraViewChange={handleCameraViewChange}
              focused={cameraFocused}
              onResetFullBody={handleResetFullBody}
              compact
            />
          </div>
        </div>

        <BodyMobileSheet
          state={
            activeAtomicZoneId
              ? sheetState === "closed"
                ? "peek"
                : sheetState
              : "closed"
          }
          onStateChange={setSheetState}
          peekTitle={activeParts?.region ?? ""}
          peekSubtitle={activeParts?.detail}
        >
          {contextPanel}
          <div className="mt-5 border-t border-white/8 pt-4">
            <BodySelectionSummary
              selectedTargetIds={selectedTargetIds}
              onRemove={(id) =>
                setSelectedTargetIds((prev) => removeSelectionTarget(prev, id))
              }
              onClear={() => setSelectedTargetIds(clearSelectionTargets())}
              variant="stacked"
            />
          </div>
        </BodyMobileSheet>
      </div>

      {/* Desktop selection bar */}
      <div className="hidden md:block">
        <BodySelectionSummary
          selectedTargetIds={selectedTargetIds}
          onRemove={(id) =>
            setSelectedTargetIds((prev) => removeSelectionTarget(prev, id))
          }
          onClear={() => setSelectedTargetIds(clearSelectionTargets())}
          variant="bar"
        />
      </div>

      {/* Mobile selection peek when no active zone */}
      {!activeAtomicZoneId ? (
        <div className="md:hidden">
          <BodySelectionSummary
            selectedTargetIds={selectedTargetIds}
            onRemove={(id) =>
              setSelectedTargetIds((prev) => removeSelectionTarget(prev, id))
            }
            onClear={() => setSelectedTargetIds(clearSelectionTargets())}
            variant="stacked"
          />
        </div>
      ) : null}

      <BodyHoverTooltip
        atomicZoneId={hoveredAtomicZoneId}
        pointer={hoverPointer}
        visible={showDesktopTooltip}
      />
    </div>
  );
}
