"use client";

import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import type { ContextualSelectionOption } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

type BodyInteractionLabPanelProps = {
  hoveredAtomicZoneId: string | null;
  activeAtomicZoneId: string | null;
  options: readonly ContextualSelectionOption[];
  selectedTargetIds: readonly string[];
  onSelectOption: (targetId: string) => void;
  onRemoveTarget: (targetId: string) => void;
  onClearSelection: () => void;
  onCloseActive: () => void;
};

function shellClassName() {
  return "rounded-xl border border-white/10 bg-black/45 p-3 backdrop-blur-sm";
}

function labelClassName() {
  return "mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500";
}

export function BodyInteractionLabPanel({
  hoveredAtomicZoneId,
  activeAtomicZoneId,
  options,
  selectedTargetIds,
  onSelectOption,
  onRemoveTarget,
  onClearSelection,
  onCloseActive,
}: BodyInteractionLabPanelProps) {
  const detectedId = activeAtomicZoneId ?? hoveredAtomicZoneId;
  const detectedLabel = detectedId
    ? getSelectionDisplayLabel(detectedId)
    : null;

  return (
    <aside className="flex w-full flex-col gap-3 lg:w-[260px] lg:shrink-0">
      <section className={shellClassName()}>
        <p className={labelClassName()}>Zona</p>
        {detectedLabel ? (
          <div>
            <p className="text-sm font-semibold leading-snug text-zinc-100">
              {detectedLabel}
            </p>
            {activeAtomicZoneId ? (
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                activa · menú contextual
              </p>
            ) : (
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                hover
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Pasa el puntero o toca una zona del cuerpo.
          </p>
        )}
      </section>

      {activeAtomicZoneId ? (
        <section className={shellClassName()}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={labelClassName() + " mb-0"}>Seleccionar</p>
            <button
              type="button"
              onClick={onCloseActive}
              className="text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-200"
            >
              Cerrar
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {options.map((option) => (
              <button
                key={option.targetId}
                type="button"
                onClick={() => onSelectOption(option.targetId)}
                className="min-h-[40px] rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.07] active:scale-[0.98]"
              >
                <span className="block">{option.shortLabel}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className={shellClassName()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={labelClassName() + " mb-0"}>Tu selección</p>
          {selectedTargetIds.length > 0 ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-200"
            >
              Limpiar
            </button>
          ) : null}
        </div>
        {selectedTargetIds.length === 0 ? (
          <p className="text-sm text-zinc-500">Ninguna zona seleccionada.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {selectedTargetIds.map((id) => (
              <li
                key={id}
                className="flex min-h-[36px] items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5"
              >
                <span className="text-sm font-medium leading-snug text-zinc-200">
                  {getSelectionDisplayLabel(id)}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${getSelectionDisplayLabel(id)}`}
                  onClick={() => onRemoveTarget(id)}
                  className="shrink-0 px-1 text-base leading-none text-zinc-400 transition hover:text-zinc-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
