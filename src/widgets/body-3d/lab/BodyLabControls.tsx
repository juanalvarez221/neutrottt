"use client";

import type { BodyModelDefinition } from "@/widgets/body-3d/bodyModelDefinition";
import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";
import type {
  ArmDebugVisibility,
  InteractionDebugLayer,
} from "@/widgets/body-3d/domain/bodyZones";
import { CAMERA_VIEW_LABELS } from "@/widgets/body-3d/lab/bodyLabTypes";

type BodyLabControlsProps = {
  models: readonly BodyModelDefinition[];
  activeModel: BodyModelDefinition;
  onModelChange: (modelId: string) => void;
  cameraView: BodyCameraView;
  onCameraViewChange: (view: BodyCameraView) => void;
  appearance: BodyAppearanceMode;
  onAppearanceChange: (mode: BodyAppearanceMode) => void;
  wireframe: boolean;
  onWireframeChange: (value: boolean) => void;
  showInteractionZones: boolean;
  onShowInteractionZonesChange: (value: boolean) => void;
  zonesVisualization: "surface" | "edges";
  onZonesVisualizationChange: (value: "surface" | "edges") => void;
  armVisibility: ArmDebugVisibility;
  onArmVisibilityChange: (value: ArmDebugVisibility) => void;
  debugLayer: InteractionDebugLayer;
  onDebugLayerChange: (value: InteractionDebugLayer) => void;
};

const CAMERA_VIEWS: BodyCameraView[] = ["front", "back", "left", "right"];

function controlShellClassName() {
  return "rounded-xl border border-white/10 bg-black/35 p-3 backdrop-blur-sm";
}

function labelClassName() {
  return "mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500";
}

export function BodyLabControls({
  models,
  activeModel,
  onModelChange,
  cameraView,
  onCameraViewChange,
  appearance,
  onAppearanceChange,
  wireframe,
  onWireframeChange,
  showInteractionZones,
  onShowInteractionZonesChange,
  zonesVisualization,
  onZonesVisualizationChange,
  armVisibility,
  onArmVisibilityChange,
  debugLayer,
  onDebugLayerChange,
}: BodyLabControlsProps) {
  const stats = activeModel.labStats;
  const zonesAvailable = activeModel.role === "production";
  const showArmFilter =
    debugLayer === "arms" ||
    debugLayer === "arms_and_torso_pelvis_p2" ||
    debugLayer === "arms_and_torso_pelvis_final" ||
    debugLayer === "central_plus_arms_legs_l1" ||
    debugLayer === "central_plus_arms_legs_l2";

  return (
    <aside className="flex w-full flex-col gap-3 lg:w-[240px] lg:shrink-0">
      <section className={controlShellClassName()}>
        <p className={labelClassName()}>Modelo</p>
        {models.length === 1 ? (
          <p className="text-sm font-semibold text-zinc-200">
            {activeModel.displayName}
          </p>
        ) : (
          <select
            value={activeModel.id}
            onChange={(event) => onModelChange(event.target.value)}
            className="min-h-[40px] w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-zinc-100 outline-none focus:border-stone-400/40"
          >
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}
              </option>
            ))}
          </select>
        )}
        {activeModel.role === "prototype" ? (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Prototipo técnico. No es el modelo de producción.
          </p>
        ) : null}
      </section>

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
        <p className={labelClassName()}>Zonas de interacción</p>
        <label
          className={[
            "flex min-h-[40px] items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 transition",
            zonesAvailable
              ? "cursor-pointer hover:bg-white/[0.05]"
              : "cursor-not-allowed opacity-50",
          ].join(" ")}
        >
          <input
            type="checkbox"
            checked={showInteractionZones && zonesAvailable}
            disabled={!zonesAvailable}
            onChange={(event) =>
              onShowInteractionZonesChange(event.target.checked)
            }
            className="accent-stone-400"
          />
          Mostrar zonas
        </label>
        {!zonesAvailable ? (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Disponible solo con Neutro Body V1.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Diagnóstico BodyVisual + InteractionModel. Sin selección.
            </p>
            {showInteractionZones ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Capa
                </p>
                {(
                  [
                    { id: "arms", label: "Detailed Arms" },
                    { id: "torso_pelvis_final", label: "Torso + Pelvis Final" },
                    { id: "legs_l1", label: "Legs L1" },
                    { id: "legs_l2", label: "Legs L2" },
                    {
                      id: "central_plus_arms_legs_l1",
                      label: "Central + arms + L1",
                    },
                    {
                      id: "central_plus_arms_legs_l2",
                      label: "Central + arms + L2",
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.id}
                    className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/[0.05]"
                  >
                    <input
                      type="radio"
                      name="debug-layer"
                      value={option.id}
                      checked={debugLayer === option.id}
                      onChange={() => onDebugLayerChange(option.id)}
                      className="accent-stone-400"
                    />
                    {option.label}
                  </label>
                ))}
                {showArmFilter ? (
                  <>
                    <p className="pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Visibilidad brazos
                    </p>
                    {(
                      [
                        { id: "right", label: "Brazo derecho" },
                        { id: "left", label: "Brazo izquierdo" },
                        { id: "both", label: "Ambos brazos" },
                      ] as const
                    ).map((option) => (
                      <label
                        key={option.id}
                        className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/[0.05]"
                      >
                        <input
                          type="radio"
                          name="arm-visibility"
                          value={option.id}
                          checked={armVisibility === option.id}
                          onChange={() => onArmVisibilityChange(option.id)}
                          className="accent-stone-400"
                        />
                        {option.label}
                      </label>
                    ))}
                  </>
                ) : null}
                <p className="pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Visualización
                </p>
                {(
                  [
                    { id: "surface", label: "Superficie" },
                    { id: "edges", label: "Bordes" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.id}
                    className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/[0.05]"
                  >
                    <input
                      type="radio"
                      name="zones-visualization"
                      value={option.id}
                      checked={zonesVisualization === option.id}
                      onChange={() => onZonesVisualizationChange(option.id)}
                      className="accent-stone-400"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      {stats ? (
        <section className={controlShellClassName()}>
          <p className={labelClassName()}>Diagnóstico</p>
          <ul className="space-y-1.5 font-mono text-[11px] leading-relaxed text-zinc-400">
            <li>{stats.verticesLabel}</li>
            <li>{stats.trianglesLabel}</li>
            <li>{stats.meshesLabel}</li>
            <li>{stats.rigLabel}</li>
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
