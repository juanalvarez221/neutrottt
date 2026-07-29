"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { AppShell } from "@/widgets/layout/AppShell";
import { PROJECTS, PROJECT_TAGS, type ProjectTag } from "@/shared/mock/projects";
import { cn } from "@/shared/lib/cn";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export default function ProyectosPage() {
  const { t } = useSiteLanguage();
  const [activeTag, setActiveTag] = useState<"all" | ProjectTag>("all");

  const filtered = useMemo(
    () =>
      activeTag === "all"
        ? PROJECTS
        : PROJECTS.filter((project) => project.tag === activeTag),
    [activeTag],
  );

  return (
    <AppShell>
      <header>
        <p className="typo-eyebrow typo-eyebrow-muted">{t("projectsPageTag")}</p>
        <h1 className="typo-section-sm mt-2">{t("projectsPageTitle")}</h1>
        <p className="mt-2 max-w-[55ch] text-sm leading-relaxed text-zinc-500">
          {t("projectsPageBody")}
        </p>
      </header>

      <div
        className="mt-6 -mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("projectsFilterAria")}
      >
        {PROJECT_TAGS.map((tag) => {
          const active = activeTag === tag.id;
          const label =
            tag.id === "all"
              ? t("projectsFilterAll")
              : tag.id === "tattoo"
                ? t("projectsFilterTattoo")
                : t("projectsFilterAward");
          return (
            <button
              key={tag.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTag(tag.id)}
              className={cn(
                "min-h-[44px] shrink-0 border px-4 py-2.5 text-xs font-semibold transition active:scale-[0.98]",
                active
                  ? "border-stone-500/25 bg-stone-600/12 text-stone-200"
                  : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/8",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid max-[380px]:grid-cols-1 grid-cols-2 gap-3 lg:grid-cols-3">
        {filtered.map((project) => (
          <article
            key={project.id}
            className="group relative min-w-0 overflow-hidden border border-white/10 bg-[#0c0a08]"
          >
            <div className="relative aspect-[4/5]">
              <Image
                src={project.image}
                alt={project.title}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10">
                <p className="truncate text-sm font-semibold text-zinc-50">{project.title}</p>
                <p className="mt-1 text-[11px] text-zinc-400">{project.subtitle}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
