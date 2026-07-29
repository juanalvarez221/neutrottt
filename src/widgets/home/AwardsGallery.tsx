"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "framer-motion";
import { AWARDS } from "@/shared/config/awards";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function AwardsGallery() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || reduceMotion) return;

      gsap.from(root.querySelectorAll("[data-award-item]"), {
        opacity: 0,
        scale: 0.92,
        stagger: 0.04,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: {
          trigger: root,
          start: "top 80%",
          once: true,
        },
      });
    },
    { scope: rootRef, dependencies: [reduceMotion] },
  );

  return (
    <section
      ref={rootRef}
      id="premios"
      className="section-surface section-surface--portfolio scroll-mt-24 px-4 py-16 sm:px-6 md:py-20"
    >
      <div className="mx-auto max-w-[1400px]">
        <header className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_0.7fr] md:items-end">
          <div>
            <p className="typo-eyebrow typo-eyebrow-muted">{t("awardsTag")}</p>
            <h2
              className="typo-section-sm mt-2"
              style={{ fontFamily: "var(--font-stack-lettering)" }}
            >
              {t("awardsTitle")}
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.72)] md:justify-self-end md:text-right">
            {t("awardsBody")}
          </p>
        </header>

        <div className="mt-10 -mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-0 sm:px-0">
          <ul className="flex w-max gap-3 md:grid md:w-full md:grid-cols-4 md:gap-4 lg:grid-cols-7">
            {AWARDS.map((award, index) => (
              <li
                key={award.id}
                data-award-item
                className={index % 3 === 0 ? "md:mt-6" : index % 3 === 1 ? "md:mt-0" : "md:mt-3"}
              >
                <figure className="group relative w-[9.5rem] overflow-hidden border border-white/10 bg-[#0c0a08] sm:w-[11rem] md:w-auto">
                  <div className="relative aspect-[3/4] w-full">
                    <Image
                      src={award.image}
                      alt={award.title}
                      fill
                      sizes="(max-width: 768px) 160px, 14vw"
                      className="object-cover grayscale transition duration-500 group-hover:grayscale-0 group-hover:scale-[1.04]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(8,6,4,0.75))] opacity-80" />
                  </div>
                  <figcaption className="sr-only">
                    {award.title} · {award.detail}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
