"use client";

import { motion } from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { AboutProcessCarousel } from "@/widgets/home/AboutProcessCarousel";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";
import { scrollRevealViewport } from "@/shared/motion/scrollReveal";

function AboutProcessGallery() {
  const { t } = useSiteLanguage();

  return (
    <div className="about-process mt-8 border-t border-white/[0.06] pt-8 sm:mt-10 sm:pt-10">
      <div className="page-section-pad">
        <p className="typo-eyebrow typo-eyebrow-muted">{t("aboutProcessLabel")}</p>
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
      className="page-section page-section-y section-surface section-surface--about section-divider relative w-full overflow-hidden"
      aria-labelledby="about-intro-heading"
    >
      <div className="about-hero-glow pointer-events-none absolute inset-0 z-[1]" />

      <div className="page-section-pad relative z-10">
        <header className="about-intro max-w-xl">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("aboutTag")}</p>
          <h2 id="about-intro-heading" className="about-intro__title mt-2">
            {t("aboutTitle")}
          </h2>
          <p className="about-intro__line mt-3">{t("aboutLead")}</p>
        </header>

        <div className="mt-5 lg:mt-6">
          <StudioLocationTrigger variant="card" />
        </div>

        <AboutProcessGallery />
      </div>
    </motion.section>
  );
}
