"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { productTypeLabel, type ProductType } from "@/shared/config/products";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type ProductDetailBuyPanelProps = {
  productId: string;
  productType: ProductType;
  title: string;
  priceLabel: string;
  placeholder: boolean;
};

export function ProductDetailBuyPanel({
  productId,
  productType,
  title,
  priceLabel,
  placeholder,
}: ProductDetailBuyPanelProps) {
  const { t, language } = useSiteLanguage();
  const router = useRouter();
  const { dispatch } = useCart();
  const typeLabel = productTypeLabel(productType, language);

  const pitch =
    productType === "course"
      ? t("seminarPitch")
      : productType === "book"
        ? t("bookPitch")
        : null;

  const addToCart = () => {
    dispatch({ type: "ADD", productId });
  };

  const buyNow = () => {
    dispatch({ type: "ADD", productId, open: false });
    router.push("/tienda/checkout");
  };

  return (
    <aside className="lg:sticky lg:top-28">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.5)]">
        {typeLabel}
      </p>
      <h1 className="typo-gothic mt-3 text-[clamp(2rem,4vw,2.85rem)] text-[rgba(var(--rgb-sand),0.96)]">
        {title}
      </h1>

      {pitch ? (
        <p
          className="mt-4 max-w-[34ch] text-[0.8rem] font-bold uppercase tracking-[0.12em] text-[rgba(var(--rgb-ivory),0.78)]"
          style={{ fontFamily: "var(--font-stack-display)" }}
        >
          {pitch}
        </p>
      ) : null}

      <p className="mt-8 font-mono text-lg tracking-wide text-[rgba(var(--rgb-sand),0.95)]">
        {priceLabel}
      </p>

      {!placeholder ? (
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={addToCart}
            className="btn-accent typo-cta inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 active:scale-[0.98]"
          >
            {t("shopAddToCart")}
          </button>
          <button
            type="button"
            onClick={buyNow}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[rgba(var(--rgb-sand),0.28)] bg-[rgba(18,12,14,0.55)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[rgba(var(--rgb-ivory),0.88)] transition hover:border-[rgba(var(--rgb-sand),0.45)] active:scale-[0.98]"
          >
            {t("shopBuyNow")}
          </button>
        </div>
      ) : (
        <p className="mt-5 text-sm text-zinc-500">{t("shopPlaceholderBadge")}</p>
      )}

      <Link
        href="/tienda"
        className="mt-4 inline-flex min-h-11 items-center font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[rgba(var(--rgb-ivory),0.4)] transition hover:text-[rgba(var(--rgb-sand),0.85)]"
      >
        {t("shopBackToStore")}
      </Link>
    </aside>
  );
}
