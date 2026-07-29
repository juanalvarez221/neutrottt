"use client";

import { useId, useState } from "react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { ShowMoreButton } from "@/widgets/shop/ShowMoreButton";

const BOOK_HOOKS: SiteCopyKey[] = [
  "bookDetailHook1",
  "bookDetailHook2",
  "bookDetailHook3",
  "bookDetailHook4",
  "bookDetailHook5",
  "bookDetailHook6",
  "bookDetailHook7",
  "bookDetailHook8",
  "bookDetailHook9",
  "bookDetailHook10",
  "bookDetailHook11",
  "bookDetailHook12",
  "bookDetailHook13",
  "bookDetailHook14",
  "bookDetailHook15",
  "bookDetailHook16",
];

const PREVIEW_COUNT = 8;

export function BookDetailHighlights() {
  const { t } = useSiteLanguage();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? BOOK_HOOKS : BOOK_HOOKS.slice(0, PREVIEW_COUNT);
  const hiddenCount = BOOK_HOOKS.length - PREVIEW_COUNT;

  return (
    <div className="mt-14 border-t border-[rgba(var(--rgb-sand),0.14)] pt-12 sm:mt-16 sm:pt-14">
      <section aria-labelledby="book-highlights-heading" className="mx-auto max-w-[1400px]">
        <header className="max-w-xl">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("bookDetailTag")}</p>
          <h2
            id="book-highlights-heading"
            className="typo-gothic mt-2 text-[clamp(1.7rem,3.5vw,2.35rem)] text-[rgba(var(--rgb-sand),0.96)]"
          >
            {t("bookDetailTitle")}
          </h2>
          <p
            className="mt-3 text-[0.78rem] font-bold uppercase tracking-[0.12em] text-[rgba(var(--rgb-ivory),0.55)]"
            style={{ fontFamily: "var(--font-stack-display)" }}
          >
            {t("bookDetailLead")}
          </p>
        </header>

        <ul id={panelId} className="mt-8 flex flex-wrap gap-2.5">
          {visible.map((key) => (
            <li key={key}>
              <span className="inline-flex rounded-full border border-[rgba(var(--rgb-sand),0.14)] bg-[rgba(255,255,255,0.03)] px-3.5 py-2 text-[0.8rem] text-[rgba(var(--rgb-ivory),0.8)]">
                {t(key)}
              </span>
            </li>
          ))}
        </ul>

        {hiddenCount > 0 ? (
          <div className="mt-6">
            <ShowMoreButton
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              moreLabel={t("detailShowMoreBook")}
              lessLabel={t("testimonialsShowLess")}
              controlsId={panelId}
              count={hiddenCount}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
