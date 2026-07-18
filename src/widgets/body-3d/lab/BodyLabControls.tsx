"use client";

import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/lab/bodyLabTypes";
import {
  BODY_LAB_STATS,
  CAMERA_VIEW_LABELS,
} from "@/widgets/body-3d/lab/bodyLabTypes";

type BodyLabControlsProps = {
  cameraView: BodyCameraView;
  onCameraViewChange: (view: BodyCameraView) => void;
  appearance: BodyAppearanceMode;
  onAppearanceChange: (mode: BodyAppearanceMode) => void;
  wireframe: boolean;
  onWireframeChange: (value: boolean) => void;
};

const CAMERA_VIEWS: BodyCameraView[] = ["front", "back", "left", "right"];

function controlShellClassName() {
  return "rounded-xl border border-white/10 bg-black/35 p-3 backdrop-blur-sm";
}

function labelClassName() {
  return "mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500";
}

export function BodyLabControls({
  cameraView,
  onCameraViewChange,
  appearance,
  onAppearanceChange,
  wireframe,
  onWireframeChange,
}: BodyLabControlsProps) {
  return (
    <aside className="flex w-full flex-col gap-3 lg:w-[240px] lg:shrink-0">
      <section className={controlShellClassName()}>
        <p className={labelClassName()}>Cámara</p>
        <div className="grid grid-cols-2 gap-2">
          {CAMERA_VIEWS.map((view) => {
            const active = cameraView === view;
            return (
              <button
                key={view}
                type="button"
                onClick={() => onCameraViewChange(view)}
                className={[
                  "min-h-[40px] rounded-lg border px-2 py-2 text-sm font-semibold transition active:scale-[0.98]",
                  active
                    ? "border-stone-400/40 bg-stone-500/20 text-zinc-50"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/18 hover:bg-white/8",
                ].join(" ")}
              >
                {CAMERA_VIEW_LABELS[view]}
              </button>
            );
          })}
        </div>
      </section>

      <section className={controlShellClassName()}>
        <p className={labelClassName()}>Apariencia</p>
        <div className="space-y-2">
          {(
            [
              { id: "original", label: "Original" },
              { id: "neutral", label: "Neutra" },
            ] as const
          ).map((option) => (
            <label
              key={option.id}
              className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.05]"
            >
              <input
                type="radio"
                name="body-appearance"
                value={option.id}
                checked={appearance === option.id}
                onChange={() => onAppearanceChange(option.id)}
                className="accent-stone-400"
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section className={controlShellClassName()}>
        <p className={labelClassName()}>Topología</p>
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.05]">
          <input
            type="checkbox"
            checked={wireframe}
            onChange={(event) => onWireframeChange(event.target.checked)}
            className="accent-stone-400"
          />
          Mostrar wireframe
        </label>
      </section>

      <section className={controlShellClassName()}>
        <p className={labelClassName()}>Diagnóstico</p>
        <ul className="space-y-1.5 font-mono text-[11px] leading-relaxed text-zinc-400">
          <li>{BODY_LAB_STATS.verticesLabel}</li>
          <li>{BODY_LAB_STATS.trianglesLabel}</li>
          <li>{BODY_LAB_STATS.meshesLabel}</li>
          <li>{BODY_LAB_STATS.rigLabel}</li>
        </ul>
      </section>
    </aside>
  );
}
