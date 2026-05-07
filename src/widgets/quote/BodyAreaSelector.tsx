"use client";

import { Bone, CircleDot, PersonStanding, Sparkles } from "lucide-react";

export type ZoneId =
  | "brazo"
  | "antebrazo"
  | "hombro"
  | "pecho"
  | "abdomen"
  | "espalda"
  | "pierna";

type ZoneMap = {
  id: ZoneId;
  label: string;
};

const ZONES: ZoneMap[] = [
  { id: "brazo", label: "Brazo" },
  { id: "antebrazo", label: "Antebrazo" },
  { id: "hombro", label: "Hombro" },
  { id: "pecho", label: "Pecho" },
  { id: "abdomen", label: "Abdomen" },
  { id: "espalda", label: "Espalda completa" },
  { id: "pierna", label: "Pierna" },
];

const POPULAR_ZONES: ZoneId[] = [
  "antebrazo",
  "brazo",
  "pecho",
  "espalda",
  "pierna",
  "hombro",
];

function BodySilhouette({
  side,
  zone,
}: {
  side: "front" | "back";
  zone: ZoneId;
}) {
  const isActive = (id: ZoneId) => zone === id;
  const zoneClass = (id: ZoneId) =>
    isActive(id)
      ? "fill-teal-300/35 stroke-teal-200/80"
      : "fill-transparent stroke-transparent";

  return (
    <div className="relative h-[260px] w-full max-w-[170px] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_40%_15%,rgba(255,255,255,0.1),transparent_50%),linear-gradient(180deg,#111319,#090a0f)] sm:h-[300px]">
      <svg
        viewBox="0 0 170 300"
        className="h-full w-full"
        aria-label={
          side === "front" ? "Silueta anatómica frontal" : "Silueta anatómica posterior"
        }
        role="img"
      >
        <defs>
          <linearGradient id="bodyStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(210,220,255,0.55)" />
            <stop offset="100%" stopColor="rgba(210,220,255,0.28)" />
          </linearGradient>
        </defs>

        <g className="stroke-[1.4]" stroke="url(#bodyStroke)" fill="none">
          <circle cx="85" cy="34" r="16" />
          <path d="M58 62 C66 50, 104 50, 112 62 L118 110 C120 124, 112 138, 103 150 L98 195 L94 257 L86 257 L85 196 L84 257 L76 257 L72 195 L67 150 C58 138, 50 124, 52 110 Z" />
          <path d="M58 66 L42 94 L48 150 L58 150 L63 112" />
          <path d="M112 66 L128 94 L122 150 L112 150 L107 112" />
        </g>

        <g className="stroke-[1.2]">
          {side === "front" ? (
            <>
              <rect x="40" y="68" width="22" height="18" rx="8" className={zoneClass("hombro")} />
              <rect x="108" y="68" width="22" height="18" rx="8" className={zoneClass("hombro")} />
              <rect x="42" y="88" width="18" height="42" rx="9" className={zoneClass("brazo")} />
              <rect x="110" y="88" width="18" height="42" rx="9" className={zoneClass("brazo")} />
              <rect x="44" y="132" width="16" height="34" rx="8" className={zoneClass("antebrazo")} />
              <rect x="110" y="132" width="16" height="34" rx="8" className={zoneClass("antebrazo")} />
              <rect x="62" y="70" width="46" height="32" rx="12" className={zoneClass("pecho")} />
              <rect x="64" y="104" width="42" height="42" rx="12" className={zoneClass("abdomen")} />
              <rect x="68" y="150" width="34" height="104" rx="14" className={zoneClass("pierna")} />
            </>
          ) : (
            <>
              <rect x="40" y="68" width="22" height="18" rx="8" className={zoneClass("hombro")} />
              <rect x="108" y="68" width="22" height="18" rx="8" className={zoneClass("hombro")} />
              <rect x="42" y="88" width="18" height="42" rx="9" className={zoneClass("brazo")} />
              <rect x="110" y="88" width="18" height="42" rx="9" className={zoneClass("brazo")} />
              <rect x="44" y="132" width="16" height="34" rx="8" className={zoneClass("antebrazo")} />
              <rect x="110" y="132" width="16" height="34" rx="8" className={zoneClass("antebrazo")} />
              <rect x="58" y="74" width="54" height="84" rx="14" className={zoneClass("espalda")} />
              <rect x="68" y="150" width="34" height="104" rx="14" className={zoneClass("pierna")} />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

export function BodyAreaSelector({
  zone,
  onZoneChange,
}: {
  zone: ZoneId;
  onZoneChange: (zone: ZoneId) => void;
}) {
  const progress = 50;

  return (
    <div className="space-y-5">
      <div>
        <p className="typo-tech text-center uppercase tracking-[0.14em] text-zinc-300">
          Paso 2 de 4
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400/90 via-emerald-400/90 to-teal-300/90"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="typo-section text-center text-[2rem] leading-tight md:text-[2.5rem]">
          ¿En qué zona
          <br />
          irá tu tatuaje?
        </h3>
        <p className="typo-body text-center">
          Esta elección me permite estimar mejor el nivel de detalle, la técnica
          recomendada y el tiempo aproximado de trabajo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="glass-card flex flex-col items-center justify-center rounded-2xl p-3">
          <BodySilhouette side="front" zone={zone} />
          <span className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Vista frontal
          </span>
        </div>
        <div className="glass-card flex flex-col items-center justify-center rounded-2xl p-3">
          <BodySilhouette side="back" zone={zone} />
          <span className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Vista posterior
          </span>
        </div>
      </div>

      <div>
        <p className="typo-subtitle mb-3 inline-flex items-center gap-2 text-base text-zinc-100">
          <Sparkles className="h-4 w-4 text-violet-300" />
          Zonas frecuentes
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {POPULAR_ZONES.map((id) => {
            const item = ZONES.find((z) => z.id === id);
            if (!item) return null;
            const active = zone === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onZoneChange(id)}
                className={
                  active
                    ? "inline-flex items-center gap-2 rounded-xl border border-teal-300/40 bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100"
                    : "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                }
              >
                {id === "espalda" ? (
                  <PersonStanding className="h-4 w-4" />
                ) : id === "pecho" ? (
                  <Bone className="h-4 w-4" />
                ) : (
                  <CircleDot className="h-4 w-4" />
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-card rounded-xl p-2">
        <select
          value={zone}
          onChange={(e) => onZoneChange(e.target.value as ZoneId)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold text-zinc-100 outline-none focus:border-violet-500/45"
        >
          {ZONES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

