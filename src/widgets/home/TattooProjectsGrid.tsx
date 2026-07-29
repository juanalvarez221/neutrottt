"use client";

import { TATTOO_PROJECTS } from "@/shared/config/tattooProjects";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { TattooProjectCard } from "@/widgets/home/TattooProjectCard";

export function TattooProjectsGrid() {
  const { t } = useSiteLanguage();

  return (
    <section id="tatuajes" className="section-surface section-surface--portfolio px-4 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-[1400px]">
        <header className="max-w-xl">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("tattoosTag")}</p>
          <h2 className="typo-section-sm mt-2">{t("tattoosTitle")}</h2>
          <p className="mt-3 max-w-[55ch] text-sm leading-relaxed text-[rgba(var(--rgb-sand),0.72)]">
            {t("tattoosBody")}
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TATTOO_PROJECTS.map((project) => (
            <TattooProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}
