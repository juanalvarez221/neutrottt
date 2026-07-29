"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import type { Award } from "@/shared/config/awards";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { AwardsRailCarousel } from "@/widgets/home/AwardsRailCarousel";
import { TrajectoryStats } from "@/widgets/home/TrajectoryStats";

export function TrajectoryAwardsSection() {
  const { t } = useSiteLanguage();
  const router = useRouter();

  const handleOpenAward = (award: Award) => {
    router.push(`/premios#${award.id}`);
  };

  return (
    <section
      id="trayectoria"
      className="section-surface section-surface--about relative scroll-mt-24 px-4 py-16 sm:px-6 md:py-20"
      aria-labelledby="trajectory-heading"
    >
      <div className="relative z-[1] mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:items-end">
        <header className="max-w-xl">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("trajectoryTag")}</p>
          <h2
            id="trajectory-heading"
            className="typo-gothic mt-3 text-[clamp(2rem,5vw,3.25rem)] text-[rgba(var(--rgb-ivory),0.96)]"
          >
            {t("trajectoryTitle")}
          </h2>
          <p className="mt-4 max-w-[36ch] text-sm font-medium tracking-wide text-[rgba(var(--rgb-sand),0.75)]">
            {t("trajectoryBody")}
          </p>
        </header>

        <TrajectoryStats />
      </div>

      <div className="relative z-[1] mx-auto mt-12 max-w-[1400px]">
        <AwardsRailCarousel onOpenAward={(award) => handleOpenAward(award)} />

        <div className="mt-8 flex flex-col items-center border-t border-[rgba(var(--rgb-sand),0.12)] pt-8 text-center">
          <Link
            href="/premios"
            className="btn-accent typo-cta group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 active:scale-[0.98]"
          >
            <Trophy className="h-4 w-4 opacity-90" strokeWidth={1.75} />
            {t("trajectoryCta")}
            <span className="transition-transform group-hover:translate-x-1" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
