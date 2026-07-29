"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, GraduationCap } from "lucide-react";
import { formatCop, formatProductPrice, getProductById } from "@/shared/config/products";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { useCart } from "@/shared/lib/cart";

const SEMINAR = getProductById("seminario-lettering-online");
const BOOK = getProductById("el-poder-de-las-letras");
const BOOK_DIGITAL = getProductById("el-poder-de-las-letras-digital");

function ProductCtas({
  productId,
  detailsHref,
  buyLabel,
  detailsLabel,
  priceLabel,
}: {
  productId: string;
  detailsHref: string;
  buyLabel: string;
  detailsLabel: string;
  priceLabel: string;
}) {
  const { dispatch } = useCart();

  return (
    <div className="mt-7 space-y-4">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.85)]">
        {priceLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => dispatch({ type: "ADD", productId })}
          className="btn-accent typo-cta inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 active:scale-[0.98]"
        >
          {buyLabel}
        </button>
        <Link
          href={detailsHref}
          className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--rgb-sand),0.28)] bg-[rgba(18,12,14,0.55)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[rgba(var(--rgb-ivory),0.88)] transition hover:border-[rgba(var(--rgb-sand),0.45)] hover:bg-[rgba(var(--rgb-terracotta),0.12)] active:scale-[0.98]"
        >
          {detailsLabel}
          <ArrowRight
            className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </Link>
      </div>
    </div>
  );
}

export function FeaturedProducts() {
  const { t, language } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const locale = language === "en" ? "en-US" : "es-CO";
  const pendingLabel = t("shopPricePending");

  if (!SEMINAR || !BOOK) return null;

  return (
    <section
      id="aprender"
      className="section-surface section-surface--portfolio-cta relative scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"
      aria-labelledby="learn-heading"
    >
      <div className="relative z-[1] mx-auto max-w-[1400px]">
        <motion.header
          className="max-w-3xl"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="typo-eyebrow typo-eyebrow-muted">{t("learnTag")}</p>
          <h2
            id="learn-heading"
            className="typo-gothic mt-3 text-[clamp(2.1rem,5.5vw,3.6rem)] text-[rgba(var(--rgb-sand),0.96)]"
          >
            {t("learnTitle")}
          </h2>
          <div className="mt-5 max-w-[40ch] space-y-2">
            <p
              className="text-[0.95rem] font-bold uppercase tracking-[0.1em] text-[rgba(var(--rgb-ivory),0.88)]"
              style={{ fontFamily: "var(--font-stack-display)" }}
            >
              {t("learnLead")}
            </p>
            <p className="text-sm text-[rgba(var(--rgb-sand),0.72)]">{t("learnBody")}</p>
          </div>
        </motion.header>

        <div className="mt-12 grid grid-cols-1 gap-10 border-t border-[rgba(var(--rgb-sand),0.14)] pt-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-[rgba(var(--rgb-sand),0.14)]">
          <article id="seminario" className="scroll-mt-24 md:pr-10">
            <div className="relative aspect-[16/10] overflow-hidden border border-[rgba(var(--rgb-sand),0.14)] bg-[#120c0e]">
              {SEMINAR.image ? (
                <Image
                  src={SEMINAR.image}
                  alt={SEMINAR.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain contrast-[1.05] saturate-[0.9]"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[#120c0e] via-[#120c0e]/35 to-transparent" />
              <p className="absolute bottom-4 left-4 inline-flex items-center gap-2 typo-eyebrow">
                <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t("seminarTag")}
              </p>
            </div>

            <div className="pt-6">
              <h3 className="typo-gothic text-[clamp(1.7rem,3.5vw,2.35rem)] text-[rgba(var(--rgb-ivory),0.96)]">
                {t("seminarTitle")}
              </h3>
              <p
                className="mt-4 max-w-[36ch] text-[0.8rem] font-bold uppercase tracking-[0.12em] text-[rgba(var(--rgb-sand),0.8)]"
                style={{ fontFamily: "var(--font-stack-display)" }}
              >
                {t("seminarPitch")}
              </p>

              <ProductCtas
                productId={SEMINAR.id}
                detailsHref={`/tienda/${SEMINAR.id}`}
                buyLabel={t("seminarBuyCta")}
                detailsLabel={t("seminarDetailsCta")}
                priceLabel={formatProductPrice(SEMINAR, locale, pendingLabel)}
              />
            </div>
          </article>

          <article
            id="libro"
            className="scroll-mt-24 border-t border-[rgba(var(--rgb-sand),0.14)] pt-10 md:border-t-0 md:pl-10 md:pt-0"
          >
            <div className="relative aspect-[16/10] overflow-hidden border border-[rgba(var(--rgb-sand),0.14)] bg-[#100b0d]">
              {BOOK.image ? (
                <Image
                  src={BOOK.image}
                  alt={BOOK.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover [filter:sepia(0.12)_contrast(1.08)]"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[#100b0d] via-[#100b0d]/35 to-transparent" />
              <p className="absolute bottom-4 left-4 inline-flex items-center gap-2 typo-eyebrow">
                <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t("bookTag")}
              </p>
            </div>

            <div className="pt-6">
              <h3 className="typo-gothic text-[clamp(1.7rem,3.5vw,2.35rem)] text-[rgba(var(--rgb-ivory),0.96)]">
                {t("bookTitle")}
              </h3>
              <p
                className="mt-4 max-w-[36ch] text-[0.8rem] font-bold uppercase tracking-[0.12em] text-[rgba(var(--rgb-sand),0.8)]"
                style={{ fontFamily: "var(--font-stack-display)" }}
              >
                {t("bookPitch")}
              </p>

              <ProductCtas
                productId={BOOK.id}
                detailsHref={`/tienda/${BOOK.id}`}
                buyLabel={t("bookBuyCta")}
                detailsLabel={t("bookDetailsCta")}
                priceLabel={`${t("bookFormatPrint")} · ${formatProductPrice(BOOK, locale, pendingLabel)}`}
              />

              {BOOK_DIGITAL ? (
                <Link
                  href={`/tienda/${BOOK_DIGITAL.id}`}
                  className="mt-3 inline-flex w-fit items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-[rgba(var(--rgb-ivory),0.45)] transition hover:text-[rgba(var(--rgb-sand),0.9)]"
                >
                  {t("bookFormatDigital")} · {formatCop(BOOK_DIGITAL.price ?? 0, locale)}
                  <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
                </Link>
              ) : null}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
