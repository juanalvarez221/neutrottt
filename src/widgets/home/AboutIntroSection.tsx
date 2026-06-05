"use client";

import { MapPin, Palette, PenLine, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { AboutProcessCarousel } from "@/widgets/home/AboutProcessCarousel";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

const MILESTONES: {
  titleKey: SiteCopyKey;
  bodyKey: SiteCopyKey;
  icon: typeof Palette;
}[] = [
  { titleKey: "aboutMilestone1Title", bodyKey: "aboutMilestone1Body", icon: Palette },
  { titleKey: "aboutMilestone2Title", bodyKey: "aboutMilestone2Body", icon: PenLine },
  { titleKey: "aboutMilestone3Title", bodyKey: "aboutMilestone3Body", icon: Sparkles },
  { titleKey: "aboutMilestone4Title", bodyKey: "aboutMilestone4Body", icon: MapPin },
];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: scrollRevealViewport,
  transition: { duration: 0.45, ease: "easeOut" as const },
};

function AboutProcessGallery() {
  const { t } = useSiteLanguage();

  return (
    <div className="mt-10 border-t border-white/[0.06] pt-10 sm:mt-12 sm:pt-12">
      <div className="page-section-pad">
        <p className="typo-eyebrow">{t("aboutProcessLabel")}</p>
        <p className="typo-body typo-body-soft mt-3">{t("aboutProcessIntro")}</p>
      </div>
      <AboutProcessCarousel />
    </div>
  );
}

export function AboutIntroSection() {
  const { t } = useSiteLanguage();

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={scrollRevealViewport}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="page-section relative w-full overflow-hidden border-t border-white/[0.06] bg-[#080605]/90 py-10 sm:py-14 md:py-18"
      aria-labelledby="about-intro-heading"
    >
      <div className="about-hero-glow pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(480px_200px_at_100%_100%,rgba(234,88,12,0.12),transparent_60%)]" />

      <div className="page-section-pad relative z-10">
        <p className="typo-eyebrow">{t("aboutTag")}</p>

        <h2 id="about-intro-heading" className="typo-section mt-3">
          {t("aboutTitle")}
        </h2>

        <p className="typo-lead mt-3">{t("aboutLead")}</p>

        <p className="typo-body typo-body-emphasis mt-5">{t("aboutBody")}</p>

        <p className="typo-body typo-body-soft mt-4">{t("aboutStory")}</p>

        <div className="mt-8 lg:mt-10">
          <StudioLocationTrigger variant="card" />
        </div>

        <div className="relative mt-8 lg:mt-10">
          <p className="typo-eyebrow typo-eyebrow-muted mb-3">{t("aboutJourneyLabel")}</p>
          <div className="absolute bottom-3 left-[0.85rem] top-3 hidden w-px md:block lg:left-[0.9rem]">
            <div className="about-timeline-track h-full w-full rounded-full" />
          </div>

          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2">
            {MILESTONES.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.li
                  key={step.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.07 }}
                  className="about-milestone-card about-milestone-card--compact relative rounded-xl p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="typo-index flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/8 text-[0.62rem] text-amber-200/90">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-amber-300/75" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-[0.78rem] font-bold uppercase leading-snug tracking-[0.04em] text-zinc-50">
                    {t(step.titleKey)}
                  </h3>
                  <p className="mt-1 text-[0.72rem] leading-snug text-zinc-400">{t(step.bodyKey)}</p>
                </motion.li>
              );
            })}
          </ul>
        </div>

        <AboutProcessGallery />
      </div>
    </motion.section>
  );
}
