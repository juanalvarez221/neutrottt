/**
 * Resumen de selecciones conceptuales (chips / barra / indicador compacto).
 */

"use client";

import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";

type BodySelectionSummaryProps = {
  selectedTargetIds: readonly string[];
  onRemove: (targetId: string) => void;
  onClear: () => void;
  variant?: "bar" | "stacked" | "compact";
  onCompactOpen?: () => void;
  className?: string;
  emptyHint?: string;
  /** Clase para ocultar según breakpoint (p. ej. panel desktop). */
  hideFromClassName?: string;
};

export function BodySelectionSummary({
  selectedTargetIds,
  onRemove,
  onClear,
  variant = "bar",
  onCompactOpen,
  className = "",
  emptyHint = "Gira el modelo y toca una zona para comenzar.",
  hideFromClassName = "",
}: BodySelectionSummaryProps) {
  const count = selectedTargetIds.length;

  if (variant === "compact") {
    if (count === 0) return null;
    return (
      <button
        type="button"
        onClick={onCompactOpen}
        className={[
          "inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(232,168,64,0.35)] bg-[rgba(23,17,13,0.9)] px-4 text-sm font-semibold text-[rgba(255,236,210,0.95)] shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:bg-[rgba(232,168,64,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]",
          hideFromClassName,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {count} {count === 1 ? "zona seleccionada" : "zonas seleccionadas"}
      </button>
    );
  }

  if (count === 0) {
    return (
      <div
        className={[
          "rounded-2xl border border-white/8 bg-black/25 px-4 py-3",
          hideFromClassName,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Tu selección
        </p>
        <p className="mt-1.5 text-sm text-zinc-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-2xl border border-white/10 bg-[rgba(23,17,13,0.88)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md",
        hideFromClassName,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Tu selección · {count}
        </p>
        {count > 1 ? (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 rounded-lg px-2 text-xs font-semibold text-zinc-400 transition hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)]"
          >
            Limpiar todo
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {count === 1
          ? "1 zona seleccionada"
          : `${count} zonas seleccionadas`}
      </p>
      <ul
        className={[
          "mt-2.5",
          variant === "bar"
            ? "flex max-h-[4.75rem] flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
            : "flex flex-col gap-1.5",
        ].join(" ")}
      >
        {selectedTargetIds.map((id) => (
          <li key={id} className={variant === "bar" ? "shrink-0" : undefined}>
            <span
              className={[
                "inline-flex max-w-full items-center gap-2 rounded-full border border-[rgba(232,168,64,0.28)] bg-[rgba(232,168,64,0.1)] pl-3 pr-1 text-sm text-[rgba(255,236,210,0.95)]",
                variant === "stacked"
                  ? "w-full justify-between rounded-xl py-2"
                  : "min-h-11",
              ].join(" ")}
            >
              <span className="truncate font-medium">
                {getSelectionDisplayLabel(id)}
              </span>
              <button
                type="button"
                aria-label={`Quitar ${getSelectionDisplayLabel(id)}`}
                onClick={() => onRemove(id)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-black/30 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.96]"
              >
                <span aria-hidden className="text-base leading-none">
                  ×
                </span>
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
