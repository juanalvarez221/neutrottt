"use client";

import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { AppShell } from "@/widgets/layout/AppShell";
import {
  PRODUCTS,
  formatProductPrice,
  productTypeLabel,
} from "@/shared/config/products";
import { ShopAddButton } from "@/widgets/shop/ShopAddButton";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export default function TiendaPage() {
  const { t, language } = useSiteLanguage();
  const pendingLabel = t("shopPricePending");

  return (
    <AppShell>
      <header className="max-w-xl">
        <p className="typo-eyebrow typo-eyebrow-muted">{t("shopPageTag")}</p>
        <h1
          className="mt-2 text-[clamp(2rem,5vw,3.2rem)] leading-none tracking-tight"
          style={{ fontFamily: "var(--font-stack-lettering)" }}
        >
          {t("shopPageTitle")}
        </h1>
        <p className="mt-3 max-w-[55ch] text-sm leading-relaxed text-zinc-500">
          {t("shopPageBody")}
        </p>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {PRODUCTS.map((product) => {
          const isFeatured = product.type === "course" || product.type === "book";
          return (
            <article
              key={product.id}
              className={`border border-white/10 bg-[#120e0b] ${
                isFeatured ? "lg:col-span-1" : "lg:col-span-1"
              }`}
            >
              <Link href={`/tienda/${product.id}`} className="block">
                <div className="relative aspect-[4/5] overflow-hidden bg-[#1a1410]">
                  {product.image && !product.placeholder ? (
                    <Image
                      src={product.image}
                      alt={product.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition duration-300 hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(145deg,#1c1612,#0f0c0a)] text-zinc-500">
                      <Package className="h-8 w-8" strokeWidth={1.5} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                        {t("shopPlaceholderHint")}
                      </span>
                    </div>
                  )}
                  {product.placeholder ? (
                    <span className="absolute left-3 top-3 border border-white/15 bg-black/55 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-200">
                      {t("shopPlaceholderBadge")}
                    </span>
                  ) : null}
                </div>
              </Link>
              <div className="p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  {productTypeLabel(product.type, language)}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-50">
                  <Link href={`/tienda/${product.id}`}>{product.title}</Link>
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                  {product.description}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-sm text-[rgba(var(--rgb-sand),0.9)]">
                    {formatProductPrice(product, language === "en" ? "en-US" : "es-CO", pendingLabel)}
                  </p>
                  {!product.placeholder ? (
                    <div className="flex gap-2">
                      <ShopAddButton productId={product.id} />
                      <Link
                        href={`/tienda/${product.id}`}
                        className="inline-flex min-h-11 items-center border border-white/15 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 transition active:scale-[0.98]"
                      >
                        {t("shopBuyNow")}
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
