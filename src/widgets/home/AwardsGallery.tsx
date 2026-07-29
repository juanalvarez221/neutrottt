"use client";

import Image from "next/image";
import { AWARDS } from "@/shared/config/awards";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export function AwardsGallery() {
  const { t } = useSiteLanguage();

  return (
    <section id="premios" className="section-surface section-surface--portfolio px-4 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-[1400px]">
        <header className="max-w-xl">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("awardsTag")}</p>
          <h2 className="typo-section-sm mt-2">{t("awardsTitle")}</h2>
          <p className="mt-3 max-w-[55ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.72)]">
            {t("awardsBody")}
          </p>
        </header>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-4">
          {AWARDS.map((award) => (
            <li key={award.id}>
              <figure className="group relative overflow-hidden border border-white/8 bg-[#0c0a08] shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:hover:scale-[1.02] motion-safe:hover:shadow-[0_18px_40px_rgba(0,0,0,0.4)] motion-safe:active:scale-[0.99]">
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src={award.image}
                    alt={award.title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="sr-only">
                  {award.title} · {award.detail}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
