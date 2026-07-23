/**
 * Bottom sheet móvil: CLOSED / PEEK / EXPANDED.
 * PEEK muestra opciones principales (exacta + región) — sin fricción extra.
 */

"use client";

import type { ReactNode } from "react";

export type MobileSheetState = "closed" | "peek" | "expanded";

type BodyMobileSheetProps = {
  state: MobileSheetState;
  onStateChange: (state: MobileSheetState) => void;
  /** Contenido del peek (zona + opciones principales). */
  peekContent: ReactNode;
  /** Contenido expandido (opciones amplias + selección). */
  children: ReactNode;
  /** Breakpoint: ocultar cuando el layout usa panel flotante. */
  hideFromClassName?: string;
};

export function BodyMobileSheet({
  state,
  onStateChange,
  peekContent,
  children,
  hideFromClassName = "min-[900px]:hidden",
}: BodyMobileSheetProps) {
  if (state === "closed") return null;

  const expanded = state === "expanded";

  return (
    <div
      className={[
        "pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end",
        hideFromClassName,
      ].join(" ")}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className={[
          "pointer-events-auto mx-auto w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/12 border-b-0 bg-[rgba(23,17,13,0.96)] shadow-[0_-16px_48px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[max-height] duration-250 ease-out",
          expanded ? "max-h-[64dvh]" : "max-h-[min(34dvh,20rem)]",
        ].join(" ")}
        role="dialog"
        aria-label="Opciones de zona"
      >
        <div className="flex justify-center pt-2.5">
          <button
            type="button"
            aria-label={expanded ? "Minimizar panel" : "Expandir panel"}
            onClick={() => onStateChange(expanded ? "peek" : "expanded")}
            className="flex min-h-11 min-w-16 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)]"
          >
            <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
          </button>
        </div>

        {!expanded ? (
          <div className="max-h-[calc(min(34dvh,20rem)-2.5rem)] overflow-y-auto overscroll-contain px-4 pb-5 pt-1">
            {peekContent}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => onStateChange("closed")}
                className="min-h-11 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)]"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => onStateChange("expanded")}
                className="inline-flex min-h-11 items-center rounded-full border border-white/12 bg-black/40 px-4 text-xs font-semibold text-zinc-100 transition hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
              >
                Más opciones
              </button>
            </div>
          </div>
        ) : (
          <div className="flex max-h-[calc(62dvh-2.5rem)] flex-col">
            <div className="flex items-center justify-between px-4 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Opciones
              </p>
              <button
                type="button"
                onClick={() => onStateChange("closed")}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-400 transition hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)]"
                aria-label="Cerrar panel"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-4 pb-6">
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
