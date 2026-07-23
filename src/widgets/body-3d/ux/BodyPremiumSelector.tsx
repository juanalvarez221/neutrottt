/**
 * Selector corporal 3D premium — API lista para integración.
 * Soporte controlled (`value` + `onChange`) y uncontrolled (estado interno).
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  findContainingSelections,
  replaceContainingSelection,
} from "@/widgets/body-3d/ux/bodyContainedSelection";
import {
  applySelectionChange,
  isControlledSelection,
  resolveControlledTargets,
} from "@/widgets/body-3d/ux/bodyControlledSelection";
import { BodyContextOptions } from "@/widgets/body-3d/ux/BodyContextOptions";
import { BodyHoverTooltip } from "@/widgets/body-3d/ux/BodyHoverTooltip";
import {
  BodyMobileSheet,
  type MobileSheetState,
} from "@/widgets/body-3d/ux/BodyMobileSheet";
import { BodySelectionSummary } from "@/widgets/body-3d/ux/BodySelectionSummary";
import type { BodySelectionTargetId } from "@/widgets/body-3d/ux/bodySelectionSerialization";
import {
  buildBodySelectionSnapshot,
  serializeConceptualBodySelection,
} from "@/widgets/body-3d/ux/bodySelectionSerialization";
import { BodyViewControls } from "@/widgets/body-3d/ux/BodyViewControls";

/** Sheet / panel flotante a partir de 900px (modelo primero en tablet estrecha). */
export const BODY_SELECTOR_DESKTOP_MIN_PX = 900;

export type BodyPremiumSelectorProps = {
  model: BodyModelDefinition;
  /** Modo controlado: targets conceptuales seleccionados. */
  value?: readonly BodySelectionTargetId[];
  /** Valor inicial en modo no controlado. */
  defaultValue?: readonly BodySelectionTargetId[];
  onChange?: (nextTargets: BodySelectionTargetId[]) => void;
  onContinue?: (targets: BodySelectionTargetId[]) => void;
  initialView?: BodyCameraView;
  className?: string;
  /** Altura del marco del visor (CSS). Default lab. */
  frameHeight?: string;
  /** Muestra botón Continuar + payload demo (solo laboratorio). */
  showLabContinue?: boolean;
};

export function BodyPremiumSelector({
  model,
  value,
  defaultValue,
  onChange,
  onContinue,
  initialView = "front",
  className = "",
  frameHeight = "min(82dvh, 760px)",
  showLabContinue = false,
}: BodyPremiumSelectorProps) {
  const controlled = isControlledSelection(value);
  const [internalTargets, setInternalTargets] = useState<
    BodySelectionTargetId[]
  >(() => [...(defaultValue ?? [])]);

  const selectedTargetIds = resolveControlledTargets(value, internalTargets);

  const [cameraView, setCameraView] = useState<BodyCameraView>(initialView);
  const [cameraViewToken, setCameraViewToken] = useState(0);
  const [hoveredAtomicZoneId, setHoveredAtomicZoneId] = useState<string | null>(
    null,
  );
  const [activeAtomicZoneId, setActiveAtomicZoneId] = useState<string | null>(
    null,
  );
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);
  const [hoverPointer, setHoverPointer] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [sheetState, setSheetState] = useState<MobileSheetState>("closed");
  const [sheetMode, setSheetMode] = useState<"zone" | "selection">("zone");
  const [focusPose, setFocusPose] = useState<CameraFocusPose | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [cameraFocused, setCameraFocused] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showContainedOverride, setShowContainedOverride] = useState(false);
  const [replacingTargetId, setReplacingTargetId] = useState<string | null>(
    null,
  );
  const [isOrbitDragging, setIsOrbitDragging] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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

  function commitTargets(next: BodySelectionTargetId[]) {
    applySelectionChange(next, {
      controlled,
      onChange,
      setInternal: setInternalTargets,
    });
  }

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
    setReplacingTargetId(null);
    setPreviewTargetId(null);
    setSheetMode("zone");
    setSheetState("peek");

    const pose = getCameraFocusForAtomicZone(atomicId, model.camera);
    setFocusPose(pose);
    setFocusToken((t) => t + 1);
    setCameraFocused(true);
  }

  function handleSelectOption(targetId: string) {
    let next: BodySelectionTargetId[];
    if (replacingTargetId) {
      next = replaceContainingSelection(
        selectedTargetIds,
        replacingTargetId,
        targetId,
      );
    } else {
      next = addSelectionTarget(selectedTargetIds, targetId);
    }
    commitTargets(next);
    setActiveAtomicZoneId(null);
    setPreviewTargetId(null);
    setSheetState("closed");
    setShowContainedOverride(false);
    setReplacingTargetId(null);
  }

  function handleCloseActive() {
    setActiveAtomicZoneId(null);
    setPreviewTargetId(null);
    setSheetState("closed");
    setShowContainedOverride(false);
    setReplacingTargetId(null);
    setSheetMode("zone");
  }

  function handleContinue() {
    if (selectedTargetIds.length === 0) return;
    onContinue?.(selectedTargetIds);
    if (showLabContinue) {
      const snap = buildBodySelectionSnapshot(selectedTargetIds);
      setPayloadPreview(
        JSON.stringify(
          {
            ...serializeConceptualBodySelection(selectedTargetIds),
            resolvedAtomicZoneIds: snap.resolvedAtomicZoneIds,
          },
          null,
          2,
        ),
      );
    }
  }

  const showDesktopTooltip =
    !isCoarsePointer &&
    !isOrbitDragging &&
    Boolean(hoveredAtomicZoneId) &&
    hoveredAtomicZoneId !== activeAtomicZoneId;

  const sharedOptionProps = activeAtomicZoneId
    ? {
        activeAtomicZoneId,
        options: contextualOptions,
        contained,
        selectedTargetIds,
        onSelectOption: handleSelectOption,
        onPreviewOption: (id: string | null) => {
          setPreviewTargetId(id);
        },
        onRemoveContained: (targetId: string) => {
          commitTargets(removeSelectionTarget(selectedTargetIds, targetId));
          handleCloseActive();
        },
        onChangeSelection: () => {
          const first = contained[0];
          setReplacingTargetId(first?.targetId ?? null);
          setShowContainedOverride(true);
        },
        replacingTargetId,
        enablePreview: !isCoarsePointer,
      }
    : null;

  const floatingPanelClass =
    "pointer-events-none absolute right-4 top-4 z-20 hidden w-[min(100%,20rem)] min-[900px]:pointer-events-auto min-[900px]:block";

  return (
    <div
      className={[
        "relative flex flex-col gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#17110d]"
        style={{ height: frameHeight }}
        onPointerDown={(e) => {
          dragStartRef.current = { x: e.clientX, y: e.clientY };
          setIsOrbitDragging(false);
        }}
        onPointerMove={(e) => {
          const start = dragStartRef.current;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (dx * dx + dy * dy > 64) {
            setIsOrbitDragging(true);
          }
        }}
        onPointerUp={() => {
          dragStartRef.current = null;
          setIsOrbitDragging(false);
        }}
        onPointerLeave={() => {
          dragStartRef.current = null;
          setIsOrbitDragging(false);
        }}
      >
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

        {!hasInteracted ? (
          <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center px-4 min-[900px]:top-8 min-[900px]:justify-start min-[900px]:pl-8">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-[rgba(23,17,13,0.72)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
              <p className="text-base font-semibold tracking-tight text-[rgba(255,242,228,0.96)]">
                ¿Dónde quieres tatuarte?
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Gira el modelo y toca una zona del cuerpo.
              </p>
              <p className="mt-1.5 hidden text-xs leading-relaxed text-zinc-500 min-[900px]:block">
                Puedes elegir una zona específica o una región completa.
              </p>
            </div>
          </div>
        ) : null}

        {activeAtomicZoneId && sharedOptionProps ? (
          <aside className={floatingPanelClass} aria-live="polite">
            <div className="rounded-2xl border border-white/12 bg-[rgba(23,17,13,0.9)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-opacity duration-200">
              <BodyContextOptions {...sharedOptionProps} mode="full" />
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

        <div className="pointer-events-none absolute bottom-4 left-4 z-20 min-[900px]:bottom-5">
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

        {/* Compact selection indicator (mobile/tablet sheet closed) */}
        {!activeAtomicZoneId && selectedTargetIds.length > 0 ? (
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 min-[900px]:hidden">
            <div className="pointer-events-auto">
              <BodySelectionSummary
                selectedTargetIds={selectedTargetIds}
                onRemove={() => undefined}
                onClear={() => undefined}
                variant="compact"
                onCompactOpen={() => {
                  setSheetMode("selection");
                  setSheetState("expanded");
                }}
              />
            </div>
          </div>
        ) : null}

        <BodyMobileSheet
          state={
            sheetMode === "selection" && sheetState !== "closed"
              ? "expanded"
              : activeAtomicZoneId
                ? sheetState === "closed"
                  ? "peek"
                  : sheetState
                : sheetState === "expanded" && sheetMode === "selection"
                  ? "expanded"
                  : "closed"
          }
          onStateChange={(next) => {
            setSheetState(next);
            if (next === "closed") {
              setSheetMode("zone");
              if (!activeAtomicZoneId) return;
              setActiveAtomicZoneId(null);
              setPreviewTargetId(null);
              setShowContainedOverride(false);
              setReplacingTargetId(null);
            }
          }}
          peekContent={
            sharedOptionProps ? (
              <BodyContextOptions {...sharedOptionProps} mode="peek" />
            ) : null
          }
        >
          {sheetMode === "selection" ? (
            <BodySelectionSummary
              selectedTargetIds={selectedTargetIds}
              onRemove={(id) =>
                commitTargets(removeSelectionTarget(selectedTargetIds, id))
              }
              onClear={() => commitTargets(clearSelectionTargets())}
              variant="stacked"
            />
          ) : sharedOptionProps ? (
            <>
              <BodyContextOptions
                {...sharedOptionProps}
                mode={showContainedOverride ? "full" : "expanded"}
              />
              <div className="mt-5 border-t border-white/8 pt-4">
                <BodySelectionSummary
                  selectedTargetIds={selectedTargetIds}
                  onRemove={(id) =>
                    commitTargets(removeSelectionTarget(selectedTargetIds, id))
                  }
                  onClear={() => commitTargets(clearSelectionTargets())}
                  variant="stacked"
                />
              </div>
            </>
          ) : null}
        </BodyMobileSheet>
      </div>

      <div className="hidden min-[900px]:block">
        <BodySelectionSummary
          selectedTargetIds={selectedTargetIds}
          onRemove={(id) =>
            commitTargets(removeSelectionTarget(selectedTargetIds, id))
          }
          onClear={() => commitTargets(clearSelectionTargets())}
          variant="bar"
        />
      </div>

      {showLabContinue ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={selectedTargetIds.length === 0}
            onClick={handleContinue}
            className={[
              "inline-flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98] sm:w-auto sm:min-w-[12rem] sm:self-end",
              selectedTargetIds.length === 0
                ? "cursor-not-allowed border border-white/8 bg-white/[0.04] text-zinc-600"
                : "border border-[rgba(232,168,64,0.45)] bg-[rgba(232,168,64,0.2)] text-[rgba(255,240,220,0.98)] hover:bg-[rgba(232,168,64,0.28)]",
            ].join(" ")}
          >
            Continuar
          </button>
          {payloadPreview ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Selection payload preview · solo laboratorio
              </p>
              <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-zinc-400">
                {payloadPreview}
              </pre>
            </div>
          ) : null}
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
