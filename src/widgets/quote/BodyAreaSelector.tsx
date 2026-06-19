"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { CircleDot, Sparkles } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  ARM_ZONE_DESC_KEYS,
  ARM_ZONES,
  isSpotHighlighted,
  POPULAR_ZONES,
  ZONE_LABEL_KEYS,
  type ZoneId,
} from "@/shared/lib/quoteZones";

export type { ZoneId };

type Hotspot = {
  id: ZoneId;
  className: string;
  style?: CSSProperties;
};

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
  viewLabel,
}: {
  side: "front" | "back";
  zone: ZoneId;
  onZoneChange: (zone: ZoneId) => void;
  viewLabel: string;
}) {
  const { t } = useSiteLanguage();
  const hotspots = side === "front" ? FRONT_HOTSPOTS : BACK_HOTSPOTS;
  const src = side === "front" ? "/body/body-map-front.png" : "/body/body-map-back.png";

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[min(100%,300px)] max-h-[min(68dvh,460px)] overflow-hidden rounded-xl border border-white/12 bg-black/20">
        <Image
          src={src}
          alt={viewLabel}
          fill
          quality={100}
          sizes="(max-width: 640px) 260px, 300px"
          className="object-cover"
          priority
        />

        {hotspots.map((spot, index) => {
          const active = isSpotHighlighted(zone, spot.id);
          const label = t(ZONE_LABEL_KEYS[spot.id]);
          return (
            <button
              key={`${side}-${spot.id}-${index}`}
              type="button"
              onClick={() => onZoneChange(spot.id)}
              aria-label={label}
              aria-pressed={active}
              style={spot.style}
              className={[
                "body-map-hotspot absolute border transition-all duration-200",
                spot.className,
                active
                  ? "border-stone-200/90 bg-stone-500/25 shadow-[0_0_0_1px_rgba(232,226,218,0.45)_inset,0_0_18px_rgba(107,99,92,0.35)]"
                  : "border-white/25 bg-black/10 hover:border-stone-300/55 hover:bg-stone-500/12",
              ].join(" ")}
            />
          );
        })}
      </div>

      <span className="mt-2 block text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {viewLabel}
      </span>
    </div>
  );
}

function ZoneChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition",
        active
          ? "border-stone-400/35 bg-stone-600/14 text-stone-100"
          : "border-white/10 bg-white/5 text-zinc-200 hover:border-stone-500/22 hover:bg-stone-600/8",
      ].join(" ")}
    >
      <CircleDot className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
      {label}
    </button>
  );
}

export function BodyAreaSelector({
  zone,
  zoneOther,
  onZoneChange,
  onZoneOtherChange,
  isLargeProject = false,
}: {
  zone: ZoneId;
  zoneOther: string;
  onZoneChange: (zone: ZoneId) => void;
  onZoneOtherChange: (value: string) => void;
  isLargeProject?: boolean;
}) {
  const { t } = useSiteLanguage();

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-zinc-400">
        {isLargeProject ? t("quoteLocationHintAdvisory") : t("quoteLocationHintQuote")}
      </p>

      <div className="space-y-3">
        <p className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
          {t("quoteZoneArmSection")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ARM_ZONES.map((id) => {
            const active = zone === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onZoneChange(id)}
                aria-pressed={active}
                className={[
                  "rounded-xl border px-4 py-3.5 text-left transition",
                  active
                    ? "border-stone-400/35 bg-stone-600/12 shadow-[inset_0_1px_0_rgba(255,248,240,0.06)]"
                    : "border-white/10 bg-black/25 hover:border-stone-500/22 hover:bg-stone-600/8",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold text-zinc-50">
                  {t(ZONE_LABEL_KEYS[id])}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                  {t(ARM_ZONE_DESC_KEYS[id])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <p className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
          {t("quoteZoneBodyMap")}
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <BodyMapImage
            side="front"
            zone={zone}
            onZoneChange={onZoneChange}
            viewLabel={t("quoteZoneFrontView")}
          />
          <BodyMapImage
            side="back"
            zone={zone}
            onZoneChange={onZoneChange}
            viewLabel={t("quoteZoneBackView")}
          />
        </div>
      </div>

      <div>
        <p className="typo-subtitle mb-3 inline-flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-zinc-200">
          <Sparkles className="h-4 w-4 text-stone-400" strokeWidth={1.75} />
          {t("quoteZonePopular")}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {POPULAR_ZONES.map((id) => (
            <ZoneChip
              key={id}
              active={zone === id}
              label={t(ZONE_LABEL_KEYS[id])}
              onClick={() => onZoneChange(id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/8 bg-black/20 p-4">
        <ZoneChip
          active={zone === "otro"}
          label={t("quoteZoneOther")}
          onClick={() => onZoneChange("otro")}
        />
        {zone === "otro" ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {t("quoteZoneOtherLabel")}
            </span>
            <input
              type="text"
              value={zoneOther}
              onChange={(event) => onZoneOtherChange(event.target.value)}
              maxLength={80}
              autoFocus
              placeholder={t("quoteZoneOtherPlaceholder")}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-stone-500/45"
            />
            <span className="block text-xs leading-relaxed text-zinc-500">
              {t("quoteZoneOtherHint")}
            </span>
          </label>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500">{t("quoteZoneOtherHint")}</p>
        )}
      </div>
    </div>
  );
}
