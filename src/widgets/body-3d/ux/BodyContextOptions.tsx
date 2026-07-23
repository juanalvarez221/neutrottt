/**
 * Opciones contextuales de producción: zona primaria + ampliar.
 * También soporta tiers legacy (exact/region/broad) para el lab técnico.
 */

"use client";

import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
import type { ContainedSelectionInfo } from "@/widgets/body-3d/ux/bodyContainedSelection";
import { splitZoneLabel } from "@/widgets/body-3d/ux/bodyUxCopy";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";

export type ContextOptionsMode = "full" | "peek" | "expanded";

type BodyContextOptionsProps = {
  activeAtomicZoneId: string;
  options: readonly ContextualSelectionOption[];
  contained: readonly ContainedSelectionInfo[];
  selectedTargetIds: readonly string[];
  onSelectOption: (targetId: string) => void;
  onPreviewOption: (targetId: string | null) => void;
  onRemoveContained: (targetId: string) => void;
  onChangeSelection: () => void;
  replacingTargetId?: string | null;
  enablePreview?: boolean;
  mode?: ContextOptionsMode;
  className?: string;
  /** Título de panel (región pública primaria). */
  panelTitle?: string | null;
  panelSubtitle?: string | null;
};

function isPublicTier(tier: ContextualSelectionOption["tier"]) {
  return tier === "primary" || tier === "amplify";
}

export function BodyContextOptions({
  activeAtomicZoneId,
  options,
  contained,
  selectedTargetIds,
  onSelectOption,
  onPreviewOption,
  onRemoveContained,
  onChangeSelection,
  replacingTargetId = null,
  enablePreview = true,
  mode = "full",
  className = "",
  panelTitle = null,
  panelSubtitle = null,
}: BodyContextOptionsProps) {
  const parts = splitZoneLabel(activeAtomicZoneId);
  const selectedSet = new Set(selectedTargetIds);
  const usesPublic = options.some((o) => isPublicTier(o.tier));

  const primary = options.filter((o) => o.tier === "primary");
  const amplify = options.filter((o) => o.tier === "amplify");

  if (contained.length > 0 && mode !== "expanded") {
    return (
      <div className={className}>
        <PanelHeader
          title={panelTitle ?? parts.full}
          subtitle={panelSubtitle}
        />
        <div className="mt-4 rounded-xl border border-[rgba(184,137,88,0.28)] bg-[rgba(184,137,88,0.08)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgba(212,160,102,0.9)]">
            Esta zona forma parte de
          </p>
          <ul className="mt-2 space-y-2">
            {contained.map((c) => (
              <li key={c.targetId}>
                <p className="text-sm font-semibold text-[rgba(255,240,220,0.95)]">
                  {c.label}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onChangeSelection}
                    className="inline-flex min-h-11 items-center rounded-lg border border-[rgba(232,168,64,0.35)] bg-[rgba(232,168,64,0.12)] px-3 text-xs font-semibold text-[rgba(255,230,200,0.95)] transition hover:bg-[rgba(232,168,64,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
                  >
                    Cambiar selección
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveContained(c.targetId)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-white/12 bg-black/30 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (usesPublic) {
    const showPrimary = mode !== "expanded";
    const showAmplify = mode !== "peek";
    const title =
      panelTitle ??
      primary[0]?.label ??
      getSelectionDisplayLabel(activeAtomicZoneId);

    return (
      <div className={className}>
        {mode !== "expanded" ? (
          <PanelHeader title={title} subtitle={panelSubtitle} />
        ) : (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Ampliar selección
          </p>
        )}
        {replacingTargetId ? (
          <p className="mt-2 text-xs text-[rgba(212,160,102,0.9)]">
            Elige qué reemplaza la selección actual.
          </p>
        ) : null}

        <div className={mode === "expanded" ? "mt-2 space-y-4" : "mt-4 space-y-4"}>
          {showPrimary && primary.length > 0 ? (
            <OptionGroup
              title={mode === "full" ? "Seleccionar zona" : null}
              options={primary}
              selectedSet={selectedSet}
              enablePreview={enablePreview}
              onSelectOption={onSelectOption}
              onPreviewOption={onPreviewOption}
              emphasizeFirst
            />
          ) : null}
          {showAmplify && amplify.length > 0 ? (
            <OptionGroup
              title={mode === "full" ? "Ampliar selección" : null}
              options={amplify}
              selectedSet={selectedSet}
              enablePreview={enablePreview}
              onSelectOption={onSelectOption}
              onPreviewOption={onPreviewOption}
            />
          ) : null}
          {mode === "peek" && amplify.length > 0 ? (
            <OptionGroup
              title={null}
              options={amplify.slice(0, 2)}
              selectedSet={selectedSet}
              enablePreview={enablePreview}
              onSelectOption={onSelectOption}
              onPreviewOption={onPreviewOption}
            />
          ) : null}
        </div>
      </div>
    );
  }

  // Legacy lab tiers
  const byTier = {
    exact: options.filter((o) => o.tier === "exact"),
    region: options.filter((o) => o.tier === "region"),
    broad: options.filter((o) => o.tier === "broad"),
  } as const;

  const tiersToShow: Array<"exact" | "region" | "broad"> =
    mode === "peek"
      ? ["exact", "region"]
      : mode === "expanded"
        ? ["broad"]
        : ["exact", "region", "broad"];

  return (
    <div className={className}>
      <PanelHeader title={parts.full} subtitle={parts.detail} />
      <div className="mt-4 space-y-4">
        {tiersToShow.map((tier) => {
          const list = byTier[tier];
          if (list.length === 0) return null;
          return (
            <OptionGroup
              key={tier}
              title={
                tier === "exact"
                  ? "Zona exacta"
                  : tier === "region"
                    ? "Zona anatómica"
                    : "Selección comercial"
              }
              options={list}
              selectedSet={selectedSet}
              enablePreview={enablePreview}
              onSelectOption={onSelectOption}
              onPreviewOption={onPreviewOption}
            />
          );
        })}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(184,137,88,0.85)]">
        Zona activa
      </p>
      <h2 className="mt-1 text-base font-semibold uppercase tracking-[0.04em] text-[rgba(255,242,228,0.97)] sm:text-lg">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1.5 text-sm leading-snug text-zinc-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

function OptionGroup({
  title,
  options,
  selectedSet,
  enablePreview,
  onSelectOption,
  onPreviewOption,
  emphasizeFirst = false,
}: {
  title: string | null;
  options: readonly ContextualSelectionOption[];
  selectedSet: ReadonlySet<string>;
  enablePreview: boolean;
  onSelectOption: (id: string) => void;
  onPreviewOption: (id: string | null) => void;
  emphasizeFirst?: boolean;
}) {
  return (
    <div>
      {title ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {title}
        </p>
      ) : null}
      <div className={title ? "mt-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
        {options.map((option, index) => {
          const already = selectedSet.has(option.targetId);
          const emphasize = emphasizeFirst && index === 0 && !already;
          return (
            <button
              key={option.targetId}
              type="button"
              disabled={already}
              aria-label={option.label}
              onClick={() => onSelectOption(option.targetId)}
              onPointerEnter={() => {
                if (enablePreview) onPreviewOption(option.targetId);
              }}
              onPointerLeave={() => {
                if (enablePreview) onPreviewOption(null);
              }}
              onFocus={() => {
                if (enablePreview) onPreviewOption(option.targetId);
              }}
              onBlur={() => {
                if (enablePreview) onPreviewOption(null);
              }}
              className={[
                "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]",
                already
                  ? "cursor-default border-white/8 bg-white/[0.03] text-zinc-500"
                  : emphasize
                    ? "border-[rgba(232,168,64,0.4)] bg-[rgba(232,168,64,0.14)] text-[rgba(255,236,210,0.96)] hover:bg-[rgba(232,168,64,0.22)]"
                    : "border-white/10 bg-black/30 text-zinc-100 hover:border-white/18 hover:bg-black/45",
              ].join(" ")}
            >
              {option.shortLabel || option.label}
              {already ? (
                <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                  Ya seleccionada
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
