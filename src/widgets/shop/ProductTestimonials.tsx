"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ProductType } from "@/shared/config/products";
import {
  BOOK_TESTIMONIALS,
  COURSE_TESTIMONIALS,
  type ProductTestimonial,
} from "@/shared/config/productTestimonials";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { ShowMoreButton } from "@/widgets/shop/ShowMoreButton";

type ProductTestimonialsProps = {
  productType: Extract<ProductType, "course" | "book">;
};

const INITIAL_COUNT = 4;

function pick(text: { es: string; en: string }, language: "es" | "en") {
  return language === "en" ? text.en : text.es;
}

function TestimonialCard({
  item,
  language,
  index,
  reduceMotion,
}: {
  item: ProductTestimonial;
  language: "es" | "en";
  index: number;
  reduceMotion: boolean | null;
}) {
  const quote = pick(item.quote, language);

  return (
    <motion.figure
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{
        duration: reduceMotion ? 0.01 : 0.32,
        delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.2),
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex h-full flex-col rounded-2xl border border-[rgba(var(--rgb-sand),0.16)] bg-[rgba(24,17,19,0.88)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6"
    >
      <blockquote className="flex-1 text-[0.95rem] leading-relaxed text-[rgba(var(--rgb-ivory),0.88)]">
        {quote}
      </blockquote>
      <figcaption className="mt-5 border-t border-[rgba(var(--rgb-sand),0.1)] pt-4">
        <p
          className="text-[0.75rem] font-bold tracking-[0.04em] text-[rgba(var(--rgb-sand),0.9)]"
          style={{ fontFamily: "var(--font-stack-display)" }}
        >
          {item.name}
        </p>
      </figcaption>
    </motion.figure>
  );
}

export function ProductTestimonials({ productType }: ProductTestimonialsProps) {
  const { t, language } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  const items = productType === "course" ? COURSE_TESTIMONIALS : BOOK_TESTIMONIALS;
  const visible = expanded ? items : items.slice(0, INITIAL_COUNT);
  const hiddenCount = Math.max(items.length - INITIAL_COUNT, 0);
  const titleKey =
    productType === "course" ? "courseTestimonialsTitle" : "bookTestimonialsTitle";

  return (
    <section
      className="mt-14 border-t border-[rgba(var(--rgb-sand),0.14)] pt-12 sm:mt-16 sm:pt-14"
      aria-labelledby="product-testimonials-heading"
    >
      <header className="max-w-xl px-0">
        <p className="typo-eyebrow typo-eyebrow-muted">{t("productTestimonialsTag")}</p>
        <h2
          id="product-testimonials-heading"
          className="typo-gothic mt-2 text-[clamp(1.55rem,3vw,2.1rem)] text-[rgba(var(--rgb-sand),0.96)]"
        >
          {t(titleKey)}
        </h2>
      </header>

      <div
        id={panelId}
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((item, index) => (
            <TestimonialCard
              key={item.id}
              item={item}
              language={language}
              index={index}
              reduceMotion={reduceMotion}
            />
          ))}
        </AnimatePresence>
      </div>

      {hiddenCount > 0 ? (
        <div className="mt-8 flex justify-center sm:justify-start">
          <ShowMoreButton
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            moreLabel={t("testimonialsShowMore")}
            lessLabel={t("testimonialsShowLess")}
            controlsId={panelId}
            count={hiddenCount}
          />
        </div>
      ) : null}
    </section>
  );
}
