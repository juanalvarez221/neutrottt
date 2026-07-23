/**
 * Opciones contextuales jerárquicas (exacta / región / amplias).
 */

"use client";

import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
import type { ContainedSelectionInfo } from "@/widgets/body-3d/ux/bodyContainedSelection";
import { splitZoneLabel } from "@/widgets/body-3d/ux/bodyUxCopy";

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
  /** Contenedor a reemplazar al elegir una opción tras "Cambiar selección". */
  replacingTargetId?: string | null;
  enablePreview?: boolean;
  /** peek = exacta+región; expanded = amplias (+ header opcional); full = todo */
  mode?: ContextOptionsMode;
  className?: string;
};

const TIER_META: Record<
  ContextualSelectionOption["tier"],
  { title: string; hint: string }
> = {
  exact: { title: "Zona exacta", hint: "Solo esta superficie" },
  region: { title: "Zona anatómica", hint: "Región completa" },
  broad: { title: "Selección comercial", hint: "Composiciones mayores" },
};

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
}: BodyContextOptionsProps) {
  const parts = splitZoneLabel(activeAtomicZoneId);
  const selectedSet = new Set(selectedTargetIds);

  const byTier = {
    exact: options.filter((o) => o.tier === "exact"),
    region: options.filter((o) => o.tier === "region"),
    broad: options.filter((o) => o.tier === "broad"),
  } as const;

  const showHeader = mode !== "expanded" || contained.length > 0;
  const tiersToShow: ContextualSelectionOption["tier"][] =
    mode === "peek"
      ? ["exact", "region"]
      : mode === "expanded"
        ? ["broad"]
        : ["exact", "region", "broad"];

  if (contained.length > 0 && mode !== "expanded") {
    return (
      <div className={className}>
        {showHeader ? (
          <Header region={parts.region} detail={parts.detail} full={parts.full} />
        ) : null}
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
                    Quitar {shortContainedVerb(c.label)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {mode !== "expanded" ? (
        <Header region={parts.region} detail={parts.detail} full={parts.full} />
      ) : (
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Opciones amplias
        </p>
      )}
      {replacingTargetId ? (
        <p className="mt-2 text-xs text-[rgba(212,160,102,0.9)]">
          Elige qué reemplaza la selección actual.
        </p>
      ) : null}
      <div className={mode === "expanded" ? "mt-2 space-y-4" : "mt-4 space-y-4"}>
        {tiersToShow.map((tier) => {
          const list = byTier[tier];
          if (list.length === 0) return null;
          const meta = TIER_META[tier];
          return (
            <div key={tier}>
              {mode === "full" ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {meta.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{meta.hint}</p>
                </>
              ) : null}
              <div className={mode === "full" ? "mt-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
                {list.map((option) => {
                  const already = selectedSet.has(option.targetId);
                  const buttonLabel =
                    mode === "peek" && tier === "exact"
                      ? `Seleccionar ${option.shortLabel.toLowerCase()}`
                      : mode === "peek" && tier === "region"
                        ? formatPeekRegionLabel(option)
                        : option.shortLabel;

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
                          : tier === "exact"
                            ? "border-[rgba(232,168,64,0.4)] bg-[rgba(232,168,64,0.14)] text-[rgba(255,236,210,0.96)] hover:bg-[rgba(232,168,64,0.22)]"
                            : "border-white/10 bg-black/30 text-zinc-100 hover:border-white/18 hover:bg-black/45",
                      ].join(" ")}
                    >
                      {buttonLabel}
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
        })}
      </div>
    </div>
  );
}

function formatPeekRegionLabel(option: ContextualSelectionOption): string {
  const base = option.shortLabel.replace(/\s+completo$/i, "").trim();
  if (/completo/i.test(option.shortLabel) || /completo/i.test(option.label)) {
    return option.shortLabel.match(/completo/i)
      ? option.shortLabel
      : `${base} completo`;
  }
  // Región anatómica: "Antebrazo derecho" → "Antebrazo completo" style
  if (option.kind === "anatomical") {
    // Prefer natural: "Antebrazo completo" from shortLabel without side if possible
    const withoutSide = base
      .replace(/\s+(derecho|izquierdo|derecha|izquierda)$/i, "")
      .trim();
    return `${withoutSide} completo`;
  }
  return option.shortLabel;
}

function shortContainedVerb(label: string): string {
  if (/manga/i.test(label)) return "manga";
  if (/brazo/i.test(label)) return "brazo";
  if (/pierna/i.test(label)) return "pierna";
  if (/espalda/i.test(label)) return "espalda";
  if (/pecho/i.test(label)) return "pecho";
  return "selección";
}

function Header({
  region,
  detail,
  full,
}: {
  region: string;
  detail: string | null;
  full: string;
}) {
  // Labels sin " · " (Espinilla derecha): mostrar como región única
  if (!detail) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(184,137,88,0.85)]">
          Zona
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-[rgba(255,242,228,0.97)]">
          {full}
        </h2>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(184,137,88,0.85)]">
        {region}
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[rgba(255,242,228,0.97)]">
        {detail}
      </h2>
    </div>
  );
}
