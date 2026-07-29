"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "framer-motion";
import { TATTOO_PROJECTS } from "@/shared/config/tattooProjects";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { TattooProjectCard } from "@/widgets/home/TattooProjectCard";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function TattooProjectsGrid() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reduceMotion) return;

      gsap.from(root.querySelectorAll("[data-tattoo-card]"), {
        opacity: 0,
        y: 56,
        clipPath: "inset(12% 0 12% 0)",
        stagger: 0.1,
        duration: 0.85,
        ease: "power3.out",
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
      id="tatuajes"
      className="section-surface section-surface--portfolio scroll-mt-24 px-4 py-16 sm:px-6 md:py-20"
    >
      <div className="mx-auto max-w-[1400px]">
        <header className="max-w-xl border-l border-[rgba(var(--rgb-terracotta),0.4)] pl-4 sm:pl-5">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("tattoosTag")}</p>
          <h2 className="typo-gothic mt-2 text-[clamp(1.85rem,4vw,2.75rem)] text-[rgba(var(--rgb-sand),0.96)]">
            {t("tattoosTitle")}
          </h2>
          <p className="mt-3 max-w-[55ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.68)]">
            {t("tattoosBody")}
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.85fr_1fr]">
          {TATTOO_PROJECTS.map((project, index) => (
            <div
              key={project.id}
              data-tattoo-card
              className={
                index === 0
                  ? "sm:col-span-2 lg:col-span-1 lg:row-span-2"
                  : index === 3
                    ? "lg:col-span-2"
                    : undefined
              }
            >
              <TattooProjectCard project={project} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
