"use client";

import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { ZONE_LABEL_KEYS, type ZoneId } from "@/shared/lib/quoteZones";

const SIMPLE_ZONES: ZoneId[] = ["pecho", "abdomen", "gluteo"];

export function isSimpleBodyZone(zone: ZoneId): boolean {
  return SIMPLE_ZONES.includes(zone);
}

export function needsZoneRefinement(zone: ZoneId): boolean {
  return zone === "cabeza" || zone === "espalda" || zone === "brazo" || zone === "pierna";
}

type SimpleProps = {
  zone: ZoneId;
};

export function SimpleZoneConfirmation({ zone }: SimpleProps) {
  const { t } = useSiteLanguage();
  if (!isSimpleBodyZone(zone)) return null;

  return (
    <section className="rounded-xl border border-stone-500/20 bg-stone-600/6 p-4">
      <p className="text-sm leading-relaxed text-zinc-400">{t("quoteSimpleZoneHint")}</p>
      <p className="mt-3 rounded-lg border border-stone-500/20 bg-stone-600/8 px-3 py-2.5 text-sm font-semibold text-stone-200">
        {t("quoteSelectionSummary")}: {t(ZONE_LABEL_KEYS[zone])}
      </p>
    </section>
  );
}

export function ZoneActiveBanner({ zone, zoneOther }: { zone: ZoneId; zoneOther?: string }) {
  const { t } = useSiteLanguage();

  const label =
    zone === "otro" ? zoneOther?.trim() || t("quoteZoneOther") : t(ZONE_LABEL_KEYS[zone]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-500/22 bg-stone-600/8 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {t("quoteActiveZoneLabel")}
      </span>
      <span className="text-sm font-semibold text-stone-100">{label}</span>
    </div>
  );
}

export function RefinementPanel({
  titleKey,
  hintKey,
  children,
}: {
  titleKey: SiteCopyKey;
  hintKey: SiteCopyKey;
  children: React.ReactNode;
}) {
  const { t } = useSiteLanguage();

  return (
    <section className="space-y-5 rounded-xl border border-stone-500/20 bg-stone-600/6 p-4">
      <div className="space-y-1">
        <p className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
          {t(titleKey)}
        </p>
        <p className="text-sm leading-relaxed text-zinc-400">{t(hintKey)}</p>
      </div>
      {children}
    </section>
  );
}
