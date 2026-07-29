"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { AboutProcessCarousel } from "@/widgets/home/AboutProcessCarousel";
import { StudioLocationTrigger } from "@/shared/ui/StudioLocationTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function AboutIntroSection() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reduceMotion) return;

      gsap.from(root.querySelectorAll("[data-about-reveal]"), {
        opacity: 0,
        y: 36,
        stagger: 0.12,
        duration: 0.75,
        ease: "power2.out",
        scrollTrigger: {
          trigger: root,
          start: "top 78%",
          once: true,
        },
      });
    },
    { scope: rootRef, dependencies: [reduceMotion] },
  );

  return (
    <section
      ref={rootRef}
      className="page-section page-section-y section-surface section-surface--about section-divider relative w-full overflow-hidden"
      aria-labelledby="about-intro-heading"
    >
      <div className="about-hero-glow pointer-events-none absolute inset-0 z-[1]" />

      <div className="page-section-pad relative z-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-12">
          <header data-about-reveal className="about-intro max-w-xl lg:pb-4">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("aboutTag")}</p>
            <h2
              id="about-intro-heading"
              className="about-intro__title mt-2"
              style={{ fontFamily: "var(--font-stack-lettering)" }}
            >
              {t("aboutTitle")}
            </h2>
            <p className="about-intro__line mt-3">{t("aboutLead")}</p>
            <p className="mt-4 max-w-[55ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.7)]">
              {t("aboutBody")}
            </p>
            <p className="mt-3 max-w-[50ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.55)]">
              {t("aboutStory")}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4">
              <div>
                <p className="typo-eyebrow typo-eyebrow-muted">{t("aboutSpecialtyNote")}</p>
                <p className="mt-1 text-sm font-semibold text-[rgba(243,230,215,0.92)]">
                  {t("aboutExpertiseLettering")}
                </p>
              </div>
              <div>
                <p className="typo-eyebrow typo-eyebrow-muted">{t("aboutLocationNote")}</p>
                <p className="mt-1 text-sm font-semibold text-[rgba(243,230,215,0.92)]">
                  Emerald Tattoo
                </p>
              </div>
            </div>
          </header>

          <div data-about-reveal className="lg:justify-self-end lg:w-full lg:max-w-md">
            <StudioLocationTrigger variant="card" />
            <p className="mt-4 max-w-[48ch] text-xs leading-relaxed text-zinc-500">
              {t("aboutProcessIntro")}
            </p>
          </div>
        </div>

        <div data-about-reveal className="about-process mt-10 border-t border-white/[0.06] pt-8 sm:mt-12 sm:pt-10">
          <div className="page-section-pad !px-0">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("aboutProcessLabel")}</p>
          </div>
          <div className="about-process-frame mt-4 overflow-hidden border border-white/10 bg-black/20 [filter:contrast(1.05)_saturate(0.78)]">
            <AboutProcessCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}
