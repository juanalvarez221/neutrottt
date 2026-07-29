"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { ShowMoreButton } from "@/widgets/shop/ShowMoreButton";

type Pillar = {
  titleKey: SiteCopyKey;
  items: SiteCopyKey[];
};

const PILLARS: Pillar[] = [
  {
    titleKey: "courseDetailPillarTechnique",
    items: [
      "courseDetailGain2Title",
      "courseDetailGain6Title",
      "courseDetailGain7Title",
      "courseDetailGain13Title",
      "courseDetailGain18Title",
      "courseDetailGain19Title",
    ],
  },
  {
    titleKey: "courseDetailPillarStyle",
    items: [
      "courseDetailGain1Title",
      "courseDetailGain11Title",
      "courseDetailGain14Title",
      "courseDetailGain17Title",
      "courseDetailGain20Title",
    ],
  },
  {
    titleKey: "courseDetailPillarBusiness",
    items: [
      "courseDetailGain3Title",
      "courseDetailGain5Title",
      "courseDetailGain9Title",
      "courseDetailGain15Title",
      "courseDetailGain16Title",
      "courseDetailGain21Title",
    ],
  },
  {
    titleKey: "courseDetailPillarCraft",
    items: [
      "courseDetailGain4Title",
      "courseDetailGain8Title",
      "courseDetailGain10Title",
      "courseDetailGain12Title",
      "courseDetailGain22Title",
    ],
  },
];

const MODULES: SiteCopyKey[] = [
  "courseDetailModule1",
  "courseDetailModule2",
  "courseDetailModule3",
  "courseDetailModule4",
  "courseDetailModule5",
  "courseDetailModule6",
  "courseDetailModule7",
  "courseDetailModule8",
  "courseDetailModule9",
  "courseDetailModule10",
];

const INCLUDES: SiteCopyKey[] = [
  "courseDetailInclude1",
  "courseDetailInclude2",
  "courseDetailInclude3",
  "courseDetailInclude4",
  "courseDetailInclude5",
  "courseDetailInclude6",
  "courseDetailInclude7",
  "courseDetailInclude8",
  "courseDetailInclude9",
  "courseDetailInclude10",
  "courseDetailInclude11",
  "courseDetailInclude12",
];

const PREVIEW_PILLARS = 2;
const PREVIEW_MODULES = 5;
const PREVIEW_INCLUDES = 6;

function Chip({
  label,
  tone = "soft",
}: {
  label: string;
  tone?: "soft" | "line";
}) {
  if (tone === "line") {
    return (
      <span className="inline-flex border border-[rgba(var(--rgb-sand),0.18)] bg-[rgba(18,12,14,0.4)] px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-[rgba(var(--rgb-sand),0.78)]">
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[0.78rem] text-[rgba(var(--rgb-ivory),0.78)]">
      {label}
    </span>
  );
}

function ExpandButton({
  expanded,
  onToggle,
  moreLabel,
  lessLabel,
  controlsId,
}: {
  expanded: boolean;
  onToggle: () => void;
  moreLabel: string;
  lessLabel: string;
  controlsId: string;
}) {
  return (
    <div className="mt-5">
      <ShowMoreButton
        expanded={expanded}
        onToggle={onToggle}
        moreLabel={moreLabel}
        lessLabel={lessLabel}
        controlsId={controlsId}
      />
    </div>
  );
}

function RevealBlock({
  open,
  reduceMotion,
  children,
}: {
  open: boolean;
  reduceMotion: boolean | null;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PillarBlock({ pillar, t }: { pillar: Pillar; t: (key: SiteCopyKey) => string }) {
  return (
    <section className="border-t border-[rgba(var(--rgb-sand),0.18)] pt-4">
      <h3
        className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.88)]"
        style={{ fontFamily: "var(--font-stack-display)" }}
      >
        {t(pillar.titleKey)}
      </h3>
      <ul className="mt-4 flex flex-wrap gap-2">
        {pillar.items.map((key) => (
          <li key={key}>
            <Chip label={t(key)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CourseDetailCurriculum() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const benefitsId = useId();
  const modulesId = useId();
  const includesId = useId();

  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [includesOpen, setIncludesOpen] = useState(false);

  const previewPillars = PILLARS.slice(0, PREVIEW_PILLARS);
  const extraPillars = PILLARS.slice(PREVIEW_PILLARS);
  const visibleModules = modulesOpen ? MODULES : MODULES.slice(0, PREVIEW_MODULES);
  const visibleIncludes = includesOpen ? INCLUDES : INCLUDES.slice(0, PREVIEW_INCLUDES);

  return (
    <div className="mt-14 border-t border-[rgba(var(--rgb-sand),0.14)] pt-12 sm:mt-16 sm:pt-14">
      <div className="mx-auto max-w-[1400px]">
        <header className="max-w-xl">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("courseDetailGainsTag")}</p>
          <h2 className="typo-gothic mt-2 text-[clamp(1.7rem,3.5vw,2.35rem)] text-[rgba(var(--rgb-sand),0.96)]">
            {t("courseDetailGainsTitle")}
          </h2>
          <p
            className="mt-3 text-[0.78rem] font-bold uppercase tracking-[0.12em] text-[rgba(var(--rgb-ivory),0.55)]"
            style={{ fontFamily: "var(--font-stack-display)" }}
          >
            {t("courseDetailGainsLead")}
          </p>
        </header>

        <div id={benefitsId} className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
          {previewPillars.map((pillar) => (
            <PillarBlock key={pillar.titleKey} pillar={pillar} t={t} />
          ))}
        </div>

        <RevealBlock open={benefitsOpen} reduceMotion={reduceMotion}>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
            {extraPillars.map((pillar) => (
              <PillarBlock key={pillar.titleKey} pillar={pillar} t={t} />
            ))}
          </div>
        </RevealBlock>

        <ExpandButton
          expanded={benefitsOpen}
          onToggle={() => setBenefitsOpen((v) => !v)}
          moreLabel={t("detailShowMoreBenefits")}
          lessLabel={t("testimonialsShowLess")}
          controlsId={benefitsId}
        />

        <div className="mt-12 grid grid-cols-1 gap-10 border-t border-[rgba(var(--rgb-sand),0.12)] pt-10 lg:grid-cols-2 lg:gap-12">
          <section aria-labelledby="course-modules-heading">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("courseDetailModulesTag")}</p>
            <h2
              id="course-modules-heading"
              className="typo-gothic mt-2 text-[clamp(1.35rem,2.6vw,1.75rem)] text-[rgba(var(--rgb-sand),0.96)]"
            >
              {t("courseDetailModulesTitle")}
            </h2>
            <ul id={modulesId} className="mt-5 flex flex-wrap gap-2">
              {visibleModules.map((key) => (
                <li key={key}>
                  <Chip label={t(key)} />
                </li>
              ))}
            </ul>
            <ExpandButton
              expanded={modulesOpen}
              onToggle={() => setModulesOpen((v) => !v)}
              moreLabel={t("detailShowMoreModules")}
              lessLabel={t("testimonialsShowLess")}
              controlsId={modulesId}
            />
          </section>

          <section aria-labelledby="course-includes-heading">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("courseDetailIncludesTag")}</p>
            <h2
              id="course-includes-heading"
              className="typo-gothic mt-2 text-[clamp(1.35rem,2.6vw,1.75rem)] text-[rgba(var(--rgb-sand),0.96)]"
            >
              {t("courseDetailIncludesTitle")}
            </h2>
            <ul id={includesId} className="mt-5 flex flex-wrap gap-2">
              {visibleIncludes.map((key) => (
                <li key={key}>
                  <Chip label={t(key)} tone="line" />
                </li>
              ))}
            </ul>
            <ExpandButton
              expanded={includesOpen}
              onToggle={() => setIncludesOpen((v) => !v)}
              moreLabel={t("detailShowMoreIncludes")}
              lessLabel={t("testimonialsShowLess")}
              controlsId={includesId}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
