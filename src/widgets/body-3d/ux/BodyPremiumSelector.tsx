/**
 * Selector corporal 3D premium — API lista para integración.
 * Soporte controlled (`value` + `onChange`) y uncontrolled (estado interno).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Body3DViewer } from "@/widgets/body-3d/Body3DViewer";
import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";
import {
  addSelectionTarget,
  clearSelectionTargets,
  removeSelectionTarget,
  resolveSelectedAtomicZoneIds,
} from "@/widgets/body-3d/interaction";
import {
  getPrimaryPublicSelectionTarget,
  getPublicSelectionOptionsForAtomicZone,
  isNonSelectableSurfaceAtomic,
  NON_SELECTABLE_SURFACE_NOTICE,
  upgradeBodySelectionToPublicTargets,
} from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
import { isPublicSelectableBodyTarget } from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
import {
  resolvePublicTargetHighlightRegions,
  resolvePublicTargetsHighlightRegions,
} from "@/widgets/body-3d/domain/bodyPublicHighlightRegions";
import {
  getPublicDescription,
  getPublicShortLabel,
} from "@/widgets/body-3d/domain/bodyPublicRegionMeta";
import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import {
  getCameraFocusForAtomicZone,
  getFullBodyCameraPose,
  type CameraFocusPose,
} from "@/widgets/body-3d/ux/bodyCameraFocus";
import {
  getCameraPoseForPublicTarget,
  getPreferredBodyView,
  isPreferredViewAlreadyActive,
  toCardinalCameraView,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";
import type { FittedBodyFraming } from "@/widgets/body-3d/ux/bodyFitFraming";
import type { BodyCameraFraming } from "@/widgets/body-3d/cameraViewHelpers";
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
import {
  resolveContextualPanelSide,
  resolveDesktopPanelMaxWidth,
  resolveSelectorLayoutMode,
  type SelectorLayoutMode,
} from "@/widgets/body-3d/ux/bodySelectorLayout";
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
  /** Altura del marco del visor (CSS). Default producción responsive. */
  frameHeight?: string;
  /** Muestra botón Continuar + payload demo (solo laboratorio). */
  showLabContinue?: boolean;
  /** Overlay intro dentro del canvas. En cotización suele ir el título fuera. */
  showIntroOverlay?: boolean;
  loadingLabel?: string;
  introTitle?: string;
  introBody?: string;
  introHintDesktop?: string;
};

export function BodyPremiumSelector({
  model,
  value,
  defaultValue,
  onChange,
  onContinue,
  initialView = "front",
  className = "",
  frameHeight = "clamp(420px, 64dvh, 680px)",
  showLabContinue = false,
  showIntroOverlay = true,
  loadingLabel = "Preparando el modelo…",
  introTitle = "¿Dónde quieres tatuarte?",
  introBody = "Gira el modelo y toca una zona del cuerpo.",
  introHintDesktop = "Puedes elegir una zona específica o una región completa.",
}: BodyPremiumSelectorProps) {
  const controlled = isControlledSelection(value);
  const [internalTargets, setInternalTargets] = useState<
    BodySelectionTargetId[]
  >(() => [...(defaultValue ?? [])]);

  const selectedTargetIds = useMemo(
    () =>
      upgradeBodySelectionToPublicTargets(
        resolveControlledTargets(value, internalTargets),
      ).filter(isPublicSelectableBodyTarget),
    [value, internalTargets],
  );

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
  const [interactionReady, setInteractionReady] = useState(false);
  const [fitFraming, setFitFraming] = useState<FittedBodyFraming | null>(null);
  const [surfaceNotice, setSurfaceNotice] = useState<string | null>(null);
  const surfaceNoticeTimerRef = useRef<number | null>(null);
  const [confirmedTargetId, setConfirmedTargetId] = useState<string | null>(
    null,
  );
  const [layoutMode, setLayoutMode] =
    useState<SelectorLayoutMode>("desktop-medium");
  const [viewportWidth, setViewportWidth] = useState(1280);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleInteractionReady = useCallback(() => {
    setInteractionReady(true);
  }, []);

  const handleFitFraming = useCallback((framing: FittedBodyFraming) => {
    setFitFraming(framing);
  }, []);

  const activeFraming: BodyCameraFraming = fitFraming ?? model.camera;

  // Failsafe: no dejar el overlay bloqueado si el callback no llega
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInteractionReady(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (surfaceNoticeTimerRef.current != null) {
        window.clearTimeout(surfaceNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const w = window.innerWidth;
      setViewportWidth(w);
      setLayoutMode(resolveSelectorLayoutMode(w));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

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

  const selectedPublicRegionIds = useMemo(
    () => resolvePublicTargetsHighlightRegions(selectedTargetIds),
    [selectedTargetIds],
  );

  const previewPublicRegionIds = useMemo(() => {
    if (previewTargetId && isPublicSelectableBodyTarget(previewTargetId)) {
      return [...resolvePublicTargetHighlightRegions(previewTargetId)];
    }
    const source = activeAtomicZoneId ?? hoveredAtomicZoneId;
    if (!source) return [];
    const primary = getPrimaryPublicSelectionTarget(source);
    return primary ? [...resolvePublicTargetHighlightRegions(primary)] : [];
  }, [activeAtomicZoneId, hoveredAtomicZoneId, previewTargetId]);

  // Legacy atomic highlight path kept for contained-selection helpers only.
  const regionHighlightIds = useMemo(() => {
    if (previewTargetId && isPublicSelectableBodyTarget(previewTargetId)) {
      return resolveTargetToAtomicZoneIds(previewTargetId);
    }
    const source = activeAtomicZoneId ?? hoveredAtomicZoneId;
    if (!source) return [];
    const primary = getPrimaryPublicSelectionTarget(source);
    return primary ? resolveTargetToAtomicZoneIds(primary) : [];
  }, [activeAtomicZoneId, hoveredAtomicZoneId, previewTargetId]);

  const contextualOptions = useMemo(
    () =>
      activeAtomicZoneId
        ? getPublicSelectionOptionsForAtomicZone(activeAtomicZoneId)
        : [],
    [activeAtomicZoneId],
  );

  const panelPrimaryLabel = useMemo(() => {
    if (!activeAtomicZoneId) return null;
    const primary = getPrimaryPublicSelectionTarget(activeAtomicZoneId);
    return primary ? getPublicShortLabel(primary) : null;
  }, [activeAtomicZoneId]);

  const panelSubtitle = useMemo(() => {
    if (!activeAtomicZoneId) return null;
    const primary = getPrimaryPublicSelectionTarget(activeAtomicZoneId);
    return primary ? getPublicDescription(primary) : null;
  }, [activeAtomicZoneId]);

  const ariaZoneAnnouncement = useMemo(() => {
    if (surfaceNotice) return surfaceNotice;
    if (confirmedTargetId) {
      return `Zona seleccionada: ${getPublicShortLabel(confirmedTargetId)}`;
    }
    if (!panelPrimaryLabel) return "";
    return `Zona seleccionada: ${panelPrimaryLabel}`;
  }, [confirmedTargetId, panelPrimaryLabel, surfaceNotice]);

  const confirmedShort = confirmedTargetId
    ? getPublicShortLabel(confirmedTargetId)
    : null;
  const confirmedDescription = confirmedTargetId
    ? getPublicDescription(confirmedTargetId)
    : null;

  const panelSide = useMemo(
    () => resolveContextualPanelSide(hoverPointer?.x ?? null, viewportWidth),
    [hoverPointer?.x, viewportWidth],
  );

  const panelMaxWidth = useMemo(
    () => resolveDesktopPanelMaxWidth(layoutMode, viewportWidth),
    [layoutMode, viewportWidth],
  );

  const contained = useMemo(() => {
    if (!activeAtomicZoneId || showContainedOverride) return [];
    return findContainingSelections(activeAtomicZoneId, selectedTargetIds);
  }, [activeAtomicZoneId, selectedTargetIds, showContainedOverride]);

  function commitTargets(next: BodySelectionTargetId[]) {
    const publicOnly = upgradeBodySelectionToPublicTargets(next).filter(
      isPublicSelectableBodyTarget,
    );
    applySelectionChange(publicOnly, {
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
    setFocusPose(getFullBodyCameraPose(activeFraming));
    setCameraView("front");
    setCameraViewToken((t) => t + 1);
    setFocusToken((t) => t + 1);
    setCameraFocused(false);
  }

  function showNonSelectableNotice() {
    if (surfaceNoticeTimerRef.current != null) {
      window.clearTimeout(surfaceNoticeTimerRef.current);
    }
    setSurfaceNotice(NON_SELECTABLE_SURFACE_NOTICE);
    surfaceNoticeTimerRef.current = window.setTimeout(() => {
      setSurfaceNotice(null);
      setSheetState("closed");
      surfaceNoticeTimerRef.current = null;
    }, 2400);
  }

  function orientCameraToPublicTarget(targetId: string) {
    const preferred = getPreferredBodyView(targetId);
    if (!isPreferredViewAlreadyActive(cameraView, preferred)) {
      setCameraView(toCardinalCameraView(preferred));
      setCameraViewToken((t) => t + 1);
    }
    setFocusPose(getCameraPoseForPublicTarget(targetId, activeFraming));
    setFocusToken((t) => t + 1);
    setCameraFocused(true);
  }

  function handleActivateZone(atomicId: string) {
    markInteracted();

    if (isNonSelectableSurfaceAtomic(atomicId)) {
      setActiveAtomicZoneId(null);
      setConfirmedTargetId(null);
      setPreviewTargetId(null);
      setShowContainedOverride(false);
      setReplacingTargetId(null);
      setSheetMode("zone");
      setSheetState(isCoarsePointer ? "peek" : "closed");
      showNonSelectableNotice();
      return;
    }

    setSurfaceNotice(null);
    setConfirmedTargetId(null);
    setActiveAtomicZoneId(atomicId);
    setShowContainedOverride(false);
    setReplacingTargetId(null);
    setPreviewTargetId(null);
    setSheetMode("zone");
    setSheetState("peek");

    const primary = getPrimaryPublicSelectionTarget(atomicId);
    const preferred = primary ? getPreferredBodyView(primary) : null;
    const clearlyOpposite =
      preferred != null &&
      ((cameraView === "front" && preferred.startsWith("back")) ||
        (cameraView === "back" && preferred.startsWith("front")));

    if (clearlyOpposite && primary) {
      // Vista claramente mala para la región → ajuste hacia preferred (aún sutil vía lerp)
      orientCameraToPublicTarget(primary);
    } else {
      const pose = getCameraFocusForAtomicZone(atomicId, activeFraming);
      setFocusPose(pose);
      setFocusToken((t) => t + 1);
      setCameraFocused(true);
    }
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
    setShowContainedOverride(false);
    setReplacingTargetId(null);
    setConfirmedTargetId(targetId);
    setSheetMode("zone");
    setSheetState(isCoarsePointer ? "peek" : "closed");
    orientCameraToPublicTarget(targetId);
  }

  function handleCloseActive() {
    setActiveAtomicZoneId(null);
    setConfirmedTargetId(null);
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

  const selectableHoveredAtomicId =
    hoveredAtomicZoneId && !isNonSelectableSurfaceAtomic(hoveredAtomicZoneId)
      ? hoveredAtomicZoneId
      : null;

  const showDesktopTooltip =
    !isCoarsePointer &&
    !isOrbitDragging &&
    Boolean(selectableHoveredAtomicId) &&
    selectableHoveredAtomicId !== activeAtomicZoneId;

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
        panelTitle: panelPrimaryLabel,
        panelSubtitle,
      }
    : null;

  const floatingPanelClass = [
    "pointer-events-none absolute top-3 z-20 hidden min-[900px]:pointer-events-auto min-[900px]:block",
    panelSide === "left" ? "left-3 lg:left-4" : "right-3 lg:right-4",
  ].join(" ");

  return (
    <div
      className={["relative flex flex-col gap-3", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="sr-only" aria-live="polite">
        {ariaZoneAnnouncement}
      </div>
      <div
        className="relative min-h-[380px] overflow-hidden rounded-2xl border border-white/10 bg-[#17110d] sm:min-h-[420px]"
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
          hoveredAtomicZoneId={selectableHoveredAtomicId}
          previewAtomicZoneIds={regionHighlightIds}
          selectedAtomicZoneIds={resolvedSelectedAtomicZoneIds}
          previewPublicRegionIds={previewPublicRegionIds}
          selectedPublicRegionIds={selectedPublicRegionIds}
          onHoverAtomicZone={(id) => {
            if (!interactionReady) return;
            setHoveredAtomicZoneId(id);
            if (id && !isNonSelectableSurfaceAtomic(id)) markInteracted();
          }}
          onHoverPointer={(p) => {
            if (!interactionReady) return;
            setHoverPointer(p);
          }}
          onActivateAtomicZone={(id) => {
            if (!interactionReady) return;
            handleActivateZone(id);
          }}
          onInteractionReady={handleInteractionReady}
          onFitFraming={handleFitFraming}
          autoFit
          focusPose={focusPose}
          focusToken={focusToken}
          reducedMotion={reducedMotion}
          className="!rounded-none !border-0"
          height="100%"
          chrome={false}
          loadingLabel={loadingLabel}
        />

        {!interactionReady ? (
          <div
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[rgba(23,17,13,0.28)]"
            aria-busy
            aria-live="polite"
          >
            <p className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium tracking-wide text-zinc-300 backdrop-blur-sm">
              {loadingLabel}
            </p>
          </div>
        ) : null}

        {showIntroOverlay && !hasInteracted && interactionReady ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4 min-[900px]:top-6 min-[900px]:justify-start min-[900px]:pl-6">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-[rgba(23,17,13,0.72)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
              <p className="text-base font-semibold tracking-tight text-[rgba(255,242,228,0.96)]">
                {introTitle}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                {introBody}
              </p>
              <p className="mt-1.5 hidden text-xs leading-relaxed text-zinc-500 min-[900px]:block">
                {introHintDesktop}
              </p>
            </div>
          </div>
        ) : null}

        {surfaceNotice ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4 min-[900px]:top-5"
            role="status"
            aria-live="polite"
          >
            <p className="max-w-sm rounded-xl border border-white/10 bg-[rgba(23,17,13,0.88)] px-4 py-2.5 text-center text-sm leading-snug text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
              {surfaceNotice}
            </p>
          </div>
        ) : null}

        {activeAtomicZoneId && sharedOptionProps ? (
          <aside
            className={floatingPanelClass}
            aria-live="polite"
            style={{ width: `min(100%, ${panelMaxWidth}px)` }}
          >
            <div className="rounded-2xl border border-white/12 bg-[rgba(23,17,13,0.92)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-opacity duration-200">
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
        ) : confirmedTargetId && confirmedShort ? (
          <aside
            className={floatingPanelClass}
            aria-live="polite"
            style={{ width: `min(100%, ${panelMaxWidth}px)` }}
          >
            <div className="rounded-2xl border border-[rgba(232,168,64,0.28)] bg-[rgba(23,17,13,0.92)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(184,137,88,0.85)]">
                Selección confirmada
              </p>
              <h2 className="mt-1 text-base font-semibold uppercase tracking-[0.04em] text-[rgba(255,242,228,0.97)]">
                {confirmedShort}
              </h2>
              {confirmedDescription ? (
                <p className="mt-1.5 text-sm leading-snug text-zinc-400">
                  {confirmedDescription}
                </p>
              ) : null}
              <p className="mt-3 text-xs font-medium text-[rgba(212,160,102,0.95)]">
                Seleccionada
              </p>
              <button
                type="button"
                onClick={() => setConfirmedTargetId(null)}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 text-xs font-semibold text-zinc-400 transition hover:bg-black/30 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
              >
                Cerrar
              </button>
            </div>
          </aside>
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-3 z-20 right-3 flex items-end justify-between gap-3 min-[900px]:bottom-4 min-[900px]:left-4 min-[900px]:right-auto">
          <div className="pointer-events-auto">
            <BodyViewControls
              cameraView={cameraView}
              onCameraViewChange={handleCameraViewChange}
              focused={cameraFocused}
              onResetFullBody={handleResetFullBody}
              compact
            />
          </div>

          {!activeAtomicZoneId && selectedTargetIds.length > 0 ? (
            <div className="pointer-events-auto min-[900px]:hidden">
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
          ) : null}
        </div>

        <BodyMobileSheet
          state={
            sheetMode === "selection" && sheetState !== "closed"
              ? "expanded"
              : activeAtomicZoneId
                ? sheetState === "closed"
                  ? "peek"
                  : sheetState
                : confirmedTargetId && sheetState !== "closed"
                  ? "peek"
                  : surfaceNotice && sheetState !== "closed"
                    ? "peek"
                    : sheetState === "expanded" && sheetMode === "selection"
                      ? "expanded"
                      : "closed"
          }
          onStateChange={(next) => {
            setSheetState(next);
            if (next === "closed") {
              setSheetMode("zone");
              setSurfaceNotice(null);
              setConfirmedTargetId(null);
              if (!activeAtomicZoneId) return;
              setActiveAtomicZoneId(null);
              setPreviewTargetId(null);
              setShowContainedOverride(false);
              setReplacingTargetId(null);
            }
          }}
          peekContent={
            surfaceNotice && !activeAtomicZoneId ? (
              <p className="px-1 py-2 text-sm leading-relaxed text-zinc-300">
                {surfaceNotice}
              </p>
            ) : confirmedTargetId && confirmedShort && !activeAtomicZoneId ? (
              <div className="px-1 py-1">
                <p className="text-base font-semibold uppercase tracking-[0.04em] text-[rgba(255,242,228,0.97)]">
                  {confirmedShort}
                </p>
                {confirmedDescription ? (
                  <p className="mt-1 text-sm text-zinc-400">
                    {confirmedDescription}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-medium text-[rgba(212,160,102,0.95)]">
                  Seleccionada
                </p>
              </div>
            ) : sharedOptionProps ? (
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
          emptyHint="Toca una zona del cuerpo para empezar tu selección."
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
        atomicZoneId={selectableHoveredAtomicId}
        pointer={hoverPointer}
        visible={showDesktopTooltip}
      />
    </div>
  );
}
