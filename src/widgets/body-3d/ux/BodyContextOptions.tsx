/**
 * Opciones contextuales jerárquicas (exacta / región / amplias).
 */

"use client";

import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
import type { ContainedSelectionInfo } from "@/widgets/body-3d/ux/bodyContainedSelection";
import { splitZoneLabel } from "@/widgets/body-3d/ux/bodyUxCopy";

type BodyContextOptionsProps = {
  activeAtomicZoneId: string;
  options: readonly ContextualSelectionOption[];
  contained: readonly ContainedSelectionInfo[];
  selectedTargetIds: readonly string[];
  onSelectOption: (targetId: string) => void;
  onPreviewOption: (targetId: string | null) => void;
  onRemoveContained: (targetId: string) => void;
  onChangeSelection: () => void;
  enablePreview?: boolean;
  className?: string;
};

const TIER_META: Record<
  ContextualSelectionOption["tier"],
  { title: string; hint: string }
> = {
  exact: { title: "Seleccionar", hint: "Solo esta superficie" },
  region: { title: "Zona completa", hint: "Región anatómica" },
  broad: { title: "Opciones amplias", hint: "Composiciones mayores" },
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
  enablePreview = true,
  className = "",
}: BodyContextOptionsProps) {
  const parts = splitZoneLabel(activeAtomicZoneId);
  const selectedSet = new Set(selectedTargetIds);

  const byTier = {
    exact: options.filter((o) => o.tier === "exact"),
    region: options.filter((o) => o.tier === "region"),
    broad: options.filter((o) => o.tier === "broad"),
  } as const;

  if (contained.length > 0) {
    return (
      <div className={className}>
        <Header region={parts.region} detail={parts.detail} />
        <div className="mt-4 rounded-xl border border-[rgba(184,137,88,0.28)] bg-[rgba(184,137,88,0.08)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgba(212,160,102,0.9)]">
            Ya forma parte de
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
                    onClick={() => onRemoveContained(c.targetId)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-white/12 bg-black/30 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
                  >
                    Quitar
                  </button>
                  <button
                    type="button"
                    onClick={onChangeSelection}
                    className="inline-flex min-h-11 items-center rounded-lg border border-[rgba(232,168,64,0.35)] bg-[rgba(232,168,64,0.12)] px-3 text-xs font-semibold text-[rgba(255,230,200,0.95)] transition hover:bg-[rgba(232,168,64,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
                  >
                    Cambiar selección
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
      <Header region={parts.region} detail={parts.detail} />
      <div className="mt-4 space-y-4">
        {(
          ["exact", "region", "broad"] as const
        ).map((tier) => {
          const list = byTier[tier];
          if (list.length === 0) return null;
          const meta = TIER_META[tier];
          return (
            <div key={tier}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {meta.title}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{meta.hint}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {list.map((option) => {
                  const already = selectedSet.has(option.targetId);
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
                      {option.shortLabel}
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

function Header({
  region,
  detail,
}: {
  region: string;
  detail: string | null;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(184,137,88,0.85)]">
        Zona
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[rgba(255,242,228,0.97)]">
        {region}
      </h2>
      {detail ? (
        <p className="mt-0.5 text-sm text-[rgba(212,160,102,0.9)]">{detail}</p>
      ) : null}
    </div>
  );
}
