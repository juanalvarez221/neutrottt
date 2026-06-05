"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { Bone, CircleDot, PersonStanding, Sparkles } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export type ZoneId =
  | "cabeza"
  | "bicep"
  | "tricep"
  | "brazo"
  | "antebrazo"
  | "hombro"
  | "pecho"
  | "abdomen"
  | "espalda"
  | "pierna"
  | "gluteo";

type ZoneMap = {
  id: ZoneId;
  label: string;
};

type Hotspot = {
  id: ZoneId;
  className: string;
  style?: CSSProperties;
};

const ZONES: ZoneMap[] = [
  { id: "cabeza", label: "Cabeza" },
  { id: "hombro", label: "Hombro" },
  { id: "espalda", label: "Espalda" },
  { id: "pecho", label: "Pecho" },
  { id: "abdomen", label: "Abdomen" },
  { id: "tricep", label: "Tricep" },
  { id: "bicep", label: "Bicep" },
  { id: "antebrazo", label: "Antebrazo" },
  { id: "pierna", label: "Pierna" },
  { id: "gluteo", label: "Gluteo" },
  { id: "brazo", label: "Brazo" },
];

const POPULAR_ZONES: ZoneId[] = [
  "cabeza",
  "hombro",
  "espalda",
  "pecho",
  "abdomen",
  "bicep",
  "tricep",
  "antebrazo",
  "pierna",
  "gluteo",
];

const FRONT_HOTSPOTS: Hotspot[] = [
  { id: "cabeza", className: "left-[38.5%] top-[3.2%] h-[11.8%] w-[23%] rounded-[999px]" },
  { id: "hombro", className: "left-[28%] top-[16%] h-[8%] w-[13.5%] rounded-[999px]" },
  { id: "hombro", className: "left-[58.5%] top-[16%] h-[8%] w-[13.5%] rounded-[999px]" },
  { id: "pecho", className: "left-[34.5%] top-[22.8%] h-[12%] w-[31%] rounded-[32%]" },
  { id: "abdomen", className: "left-[36.5%] top-[35.8%] h-[12.8%] w-[27%] rounded-[28%]" },
  {
    id: "bicep",
    className: "left-[22.5%] top-[24%] h-[12.5%] w-[10.3%] rounded-[999px]",
    style: { transform: "rotate(-12deg)" },
  },
  {
    id: "bicep",
    className: "left-[67.2%] top-[24%] h-[12.5%] w-[10.3%] rounded-[999px]",
    style: { transform: "rotate(12deg)" },
  },
  {
    id: "antebrazo",
    className: "left-[17.8%] top-[35.8%] h-[15.4%] w-[9.8%] rounded-[999px]",
    style: { transform: "rotate(-10deg)" },
  },
  {
    id: "antebrazo",
    className: "left-[72.5%] top-[35.8%] h-[15.4%] w-[9.8%] rounded-[999px]",
    style: { transform: "rotate(10deg)" },
  },
  { id: "pierna", className: "left-[38.8%] top-[57.8%] h-[33.8%] w-[11.6%] rounded-[30%]" },
  { id: "pierna", className: "left-[49.8%] top-[57.8%] h-[33.8%] w-[11.6%] rounded-[30%]" },
];

const BACK_HOTSPOTS: Hotspot[] = [
  { id: "cabeza", className: "left-[38.5%] top-[3.2%] h-[11.8%] w-[23%] rounded-[999px]" },
  { id: "hombro", className: "left-[28%] top-[16%] h-[8%] w-[13.5%] rounded-[999px]" },
  { id: "hombro", className: "left-[58.5%] top-[16%] h-[8%] w-[13.5%] rounded-[999px]" },
  { id: "espalda", className: "left-[33.8%] top-[22.8%] h-[22.4%] w-[32.5%] rounded-[30%]" },
  {
    id: "tricep",
    className: "left-[22.5%] top-[24.8%] h-[12.5%] w-[10.2%] rounded-[999px]",
    style: { transform: "rotate(-12deg)" },
  },
  {
    id: "tricep",
    className: "left-[67.3%] top-[24.8%] h-[12.5%] w-[10.2%] rounded-[999px]",
    style: { transform: "rotate(12deg)" },
  },
  {
    id: "antebrazo",
    className: "left-[18.2%] top-[36.6%] h-[15.2%] w-[9.8%] rounded-[999px]",
    style: { transform: "rotate(-10deg)" },
  },
  {
    id: "antebrazo",
    className: "left-[72.1%] top-[36.6%] h-[15.2%] w-[9.8%] rounded-[999px]",
    style: { transform: "rotate(10deg)" },
  },
  { id: "gluteo", className: "left-[38%] top-[47.2%] h-[9.6%] w-[11.4%] rounded-[45%]" },
  { id: "gluteo", className: "left-[50.2%] top-[47.2%] h-[9.6%] w-[11.4%] rounded-[45%]" },
  { id: "pierna", className: "left-[38.8%] top-[57.8%] h-[33.8%] w-[11.6%] rounded-[30%]" },
  { id: "pierna", className: "left-[49.8%] top-[57.8%] h-[33.8%] w-[11.6%] rounded-[30%]" },
];

function BodyMapImage({
  side,
  zone,
  onZoneChange,
  language,
}: {
  side: "front" | "back";
  zone: ZoneId;
  onZoneChange: (zone: ZoneId) => void;
  language: "es" | "en";
}) {
  const hotspots = side === "front" ? FRONT_HOTSPOTS : BACK_HOTSPOTS;
  const src = side === "front" ? "/body/body-map-front.png" : "/body/body-map-back.png";

  return (
    <div className="glass-card relative overflow-hidden rounded-2xl p-3">
      <div className="relative mx-auto h-[390px] w-full max-w-[260px] overflow-hidden rounded-xl border border-white/12 bg-black/20 sm:h-[460px] sm:max-w-[300px]">
        <Image
          src={src}
          alt={side === "front" ? "Mapa corporal frontal" : "Mapa corporal trasero"}
          fill
          quality={100}
          sizes="(max-width: 640px) 260px, 300px"
          className="object-cover"
          priority
        />

        {hotspots.map((spot, index) => {
          const active = zone === spot.id;
          const label = ZONES.find((item) => item.id === spot.id)?.label ?? spot.id;
          return (
            <button
              key={`${side}-${spot.id}-${index}`}
              type="button"
              onClick={() => onZoneChange(spot.id)}
              aria-label={`${label} (${side})`}
              style={spot.style}
              className={[
                "absolute border transition-all duration-200",
                spot.className,
                active
                  ? "border-amber-100/95 bg-amber-500/25 shadow-[0_0_0_1px_rgba(253,230,138,0.55)_inset,0_0_20px_rgba(251,191,36,0.4)]"
                  : "border-white/28 bg-black/10 hover:border-amber-200/70 hover:bg-amber-500/14",
              ].join(" ")}
            />
          );
        })}
      </div>

      <span className="mt-2 block text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
        {side === "front"
          ? language === "en"
            ? "Front view"
            : "Vista frontal"
          : language === "en"
            ? "Back view"
            : "Vista posterior"}
      </span>
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
  const { language } = useSiteLanguage();
  const progress = 50;

  return (
    <div className="space-y-5">
      <div>
        <p className="typo-tech text-center uppercase tracking-[0.14em] text-zinc-300">
          {language === "en" ? "Step 2 of 4" : "Paso 2 de 4"}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/90 via-orange-500/90 to-amber-400/90"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="typo-section text-center text-[2rem] leading-tight md:text-[2.5rem]">
          {language === "en" ? "Which area" : "¿Que zona"}
          <br />
          {language === "en" ? "are you tattooing?" : "quieres tatuar?"}
        </h3>
        <p className="typo-body text-center">
          {language === "en"
            ? "Pick it and I'll give you a more accurate estimate."
            : "Eligela y te doy una estimacion mas precisa."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BodyMapImage side="front" zone={zone} onZoneChange={onZoneChange} language={language} />
        <BodyMapImage side="back" zone={zone} onZoneChange={onZoneChange} language={language} />
      </div>

      <div>
        <p className="typo-subtitle mb-3 inline-flex items-center gap-2 text-base text-zinc-100">
          <Sparkles className="h-4 w-4 text-amber-300" />
          {language === "en" ? "Popular areas" : "Zonas frecuentes"}
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
                    ? "inline-flex items-center gap-2 rounded-xl border border-amber-300/45 bg-amber-500/16 px-3 py-2 text-sm font-semibold text-amber-100"
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
          className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-base font-semibold text-zinc-100 outline-none focus:border-amber-500/45"
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

