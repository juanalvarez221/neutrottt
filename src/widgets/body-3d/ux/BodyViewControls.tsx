/**
 * Controles de vista compactos (Frente / Espalda / laterales / cuerpo completo).
 * Izquierda/Derecha = anatomía del modelo, no del espectador.
 */

"use client";

import type { BodyCameraView } from "@/widgets/body-3d/bodyViewerTypes";

type BodyViewControlsProps = {
  cameraView: BodyCameraView;
  onCameraViewChange: (view: BodyCameraView) => void;
  focused: boolean;
  onResetFullBody: () => void;
  compact?: boolean;
  className?: string;
};

const VIEWS: Array<{
  id: BodyCameraView;
  label: string;
  short: string;
  title: string;
}> = [
  { id: "front", label: "Frente", short: "F", title: "Ver frente del cuerpo" },
  { id: "back", label: "Espalda", short: "E", title: "Ver espalda del cuerpo" },
  {
    id: "left",
    label: "Izquierda",
    short: "I",
    title: "Ver lado izquierdo del cuerpo",
  },
  {
    id: "right",
    label: "Derecha",
    short: "D",
    title: "Ver lado derecho del cuerpo",
  },
];

export function BodyViewControls({
  cameraView,
  onCameraViewChange,
  focused,
  onResetFullBody,
  compact = false,
  className = "",
}: BodyViewControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Controles de vista del cuerpo"
      className={["flex flex-wrap items-center gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      {VIEWS.map((view) => {
        const active = cameraView === view.id && !focused;
        return (
          <button
            key={view.id}
            type="button"
            aria-label={view.title}
            aria-pressed={active}
            title={view.title}
            onClick={() => onCameraViewChange(view.id)}
            className={[
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-xs font-semibold tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]",
              active
                ? "border-[rgba(232,168,64,0.45)] bg-[rgba(232,168,64,0.18)] text-[rgba(255,236,210,0.96)]"
                : "border-white/10 bg-black/35 text-zinc-300 hover:border-white/18 hover:bg-black/50 hover:text-zinc-100",
              compact ? "px-2.5" : "px-3",
            ].join(" ")}
          >
            <span className="hidden sm:inline">{view.label}</span>
            <span className="sm:hidden" aria-hidden>
              {view.short}
            </span>
          </button>
        );
      })}

      {focused ? (
        <button
          type="button"
          aria-label="Ver cuerpo completo"
          title="Ver cuerpo completo"
          onClick={onResetFullBody}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[rgba(184,137,88,0.35)] bg-[rgba(184,137,88,0.14)] px-3 text-xs font-semibold tracking-wide text-[rgba(255,230,200,0.95)] transition hover:bg-[rgba(184,137,88,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.98]"
        >
          <FullBodyIcon />
          <span className="hidden sm:inline">Cuerpo completo</span>
        </button>
      ) : null}
    </div>
  );
}

function FullBodyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 opacity-90"
    >
      <circle cx="8" cy="3.2" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5.2v4.2M5.2 7.2h5.6M5.4 14l2.6-4.6L10.6 14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
