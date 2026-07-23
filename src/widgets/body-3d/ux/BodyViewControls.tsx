/**
 * Controles de vista — segmented pills premium (Frente / Espalda / laterales).
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
  className = "",
}: BodyViewControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Controles de vista del cuerpo"
      className={["flex flex-wrap items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="inline-flex items-center rounded-full border border-white/12 bg-black/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
        {VIEWS.map((view) => {
          // Con focus regional, el botón cardinal debe seguir reflejando la
          // vista canónica (p. ej. Espalda alta → Espalda activo).
          const active = cameraView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              aria-label={view.title}
              aria-pressed={active}
              title={view.title}
              onClick={() => onCameraViewChange(view.id)}
              className={[
                "inline-flex min-h-10 items-center justify-center rounded-full px-3 text-[11px] font-semibold tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.97] sm:min-h-11 sm:px-3.5 sm:text-xs",
                active
                  ? "bg-[rgba(232,168,64,0.22)] text-[rgba(255,236,210,0.98)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-zinc-400 hover:text-zinc-100",
              ].join(" ")}
            >
              <span className="hidden min-[420px]:inline">{view.label}</span>
              <span className="min-[420px]:hidden" aria-hidden>
                {view.short}
              </span>
            </button>
          );
        })}
      </div>

      {focused ? (
        <button
          type="button"
          aria-label="Ver cuerpo completo"
          title="Ver cuerpo completo"
          onClick={onResetFullBody}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[rgba(184,137,88,0.4)] bg-[rgba(184,137,88,0.16)] px-3.5 text-[11px] font-semibold tracking-wide text-[rgba(255,230,200,0.95)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition hover:bg-[rgba(184,137,88,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(232,168,64,0.7)] active:scale-[0.97] sm:min-h-11 sm:text-xs"
        >
          <FullBodyIcon />
          <span className="hidden sm:inline">Completo</span>
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
