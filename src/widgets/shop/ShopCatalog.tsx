"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import {
  formatProductPrice,
  getCatalogProducts,
  productTypeLabel,
  type Product,
} from "@/shared/config/products";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { cn } from "@/shared/lib/cn";

const ease = [0.22, 1, 0.36, 1] as const;

function ProductActions({ productId }: { productId: string }) {
  const { dispatch } = useCart();
  const { t } = useSiteLanguage();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => dispatch({ type: "ADD", productId })}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[rgba(var(--rgb-sand),0.28)] bg-[rgba(18,12,14,0.65)] px-4 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.92)] transition hover:border-[rgba(var(--rgb-sand),0.45)] active:scale-[0.98]"
        style={{ fontFamily: "var(--font-stack-display)" }}
      >
        {t("shopAddToCart")}
      </button>
      <Link
        href={`/tienda/${productId}`}
        className="btn-accent typo-cta inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[0.65rem] active:scale-[0.98]"
      >
        {t("shopViewProduct")}
        <ArrowUpRight className="h-3.5 w-3.5 opacity-80" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

function ProductMeta({ product }: { product: Product }) {
  const { t, language } = useSiteLanguage();
  const locale = language === "en" ? "en-US" : "es-CO";

  return (
    <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
      <div>
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.45)]">
          {product.fulfillment === "digital"
            ? t("shopFulfillmentDigital")
            : t("shopFulfillmentPhysical")}
        </p>
        <p className="mt-1.5 font-mono text-lg tracking-wide text-[rgba(var(--rgb-sand),0.95)]">
          {formatProductPrice(product, locale)}
        </p>
      </div>
      <ProductActions productId={product.id} />
    </div>
  );
}

function FeaturedCourseCard({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const { t, language } = useSiteLanguage();
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay: index * 0.06, ease }}
      className="group relative overflow-hidden rounded-2xl border border-[rgba(var(--rgb-sand),0.14)] bg-[#100c0a]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
        <Link
          href={`/tienda/${product.id}`}
          className="relative block min-h-[16rem] overflow-hidden bg-[#0c0809] sm:min-h-[20rem]"
        >
          {product.image ? (
            <Image
              src={product.image}
              alt={product.title}
              fill
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-contain p-4 transition duration-700 group-hover:scale-[1.03] sm:p-6"
              priority
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#100c0a] via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-[#100c0a]/80" />
        </Link>

        <div className="flex flex-col justify-between p-6 sm:p-8">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-honey),0.75)]">
              {productTypeLabel(product.type, language)}
            </p>
            <h2 className="typo-gothic mt-3 text-[clamp(1.85rem,3.5vw,2.6rem)] text-[rgba(var(--rgb-sand),0.96)]">
              <Link href={`/tienda/${product.id}`} className="-my-2.5 inline-block py-2.5">
                {product.title}
              </Link>
            </h2>
            <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.58)]">
              {product.description}
            </p>
            <p className="mt-3 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.4)]">
              {t("shopFeaturedLabel")}
            </p>
          </div>
          <ProductMeta product={product} />
        </div>
      </div>
    </motion.article>
  );
}

function CatalogCard({
  product,
  index,
  featured = false,
}: {
  product: Product;
  index: number;
  featured?: boolean;
}) {
  const { language } = useSiteLanguage();
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-[rgba(var(--rgb-sand),0.12)] bg-[#120e0b]",
        featured && "md:col-span-2 lg:col-span-1",
      )}
    >
      <Link
        href={`/tienda/${product.id}`}
        className={cn(
          "relative block overflow-hidden bg-[#0c0809]",
          product.type === "merch" ? "aspect-[4/5]" : "aspect-[4/5] sm:aspect-[3/4]",
        )}
      >
        {product.image ? (
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 100vw, 40vw"
            className={cn(
              "transition duration-700 group-hover:scale-[1.04]",
              product.type === "course" ? "object-contain p-3" : "object-cover",
            )}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#120e0b] to-transparent" />
        <span className="absolute left-3 top-3 rounded-md border border-[rgba(var(--rgb-sand),0.16)] bg-black/50 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-sand),0.8)] backdrop-blur-sm">
          {productTypeLabel(product.type, language)}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-lg font-semibold tracking-tight text-[rgba(var(--rgb-ivory),0.95)]">
          <Link href={`/tienda/${product.id}`} className="-my-2.5 inline-block py-2.5">
            {product.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.5)]">
          {product.description}
        </p>
        <ProductMeta product={product} />
      </div>
    </motion.article>
  );
}

export function ShopCatalog() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const catalog = getCatalogProducts();
  const course = catalog.find((p) => p.type === "course");
  const books = catalog.filter((p) => p.type === "book");
  const merch = catalog.filter((p) => p.type === "merch");

  return (
    <div className="mt-10 space-y-14 sm:mt-12 sm:space-y-16">
      {course ? <FeaturedCourseCard product={course} index={0} /> : null}

      {books.length > 0 ? (
        <section>
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.45, ease }}
            className="mb-6 flex flex-col gap-2 border-b border-[rgba(var(--rgb-sand),0.12)] pb-5 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.45)]">
                {t("shopSectionBook")}
              </p>
              <h2 className="typo-gothic mt-2 text-[clamp(1.55rem,3vw,2.1rem)] text-[rgba(var(--rgb-sand),0.96)]">
                {t("shopSectionBookTitle")}
              </h2>
            </div>
            <p className="max-w-[34ch] text-sm text-[rgba(var(--rgb-ivory),0.48)]">
              {t("shopSectionBookBody")}
            </p>
          </motion.header>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {books.map((product, index) => (
              <CatalogCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      {merch.length > 0 ? (
        <section>
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.45, ease }}
            className="mb-6 flex flex-col gap-2 border-b border-[rgba(var(--rgb-sand),0.12)] pb-5 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[rgba(var(--rgb-sand),0.45)]">
                {t("shopSectionMerch")}
              </p>
              <h2 className="typo-gothic mt-2 text-[clamp(1.55rem,3vw,2.1rem)] text-[rgba(var(--rgb-sand),0.96)]">
                {t("shopSectionMerchTitle")}
              </h2>
            </div>
            <p className="max-w-[34ch] text-sm text-[rgba(var(--rgb-ivory),0.48)]">
              {t("shopSectionMerchBody")}
            </p>
          </motion.header>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-[1.15fr_0.85fr]">
            {merch.map((product, index) => (
              <CatalogCard
                key={product.id}
                product={product}
                index={index}
                featured={index === 0}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
