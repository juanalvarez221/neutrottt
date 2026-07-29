"use client";

import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export function ShopAddButton({ productId }: { productId: string }) {
  const { dispatch } = useCart();
  const { t } = useSiteLanguage();

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "ADD", productId })}
      className="min-h-11 border border-[rgba(var(--rgb-camel),0.35)] bg-[rgba(var(--rgb-cacao),0.45)] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[rgba(243,230,215,0.96)] transition active:scale-[0.98]"
    >
      {t("shopAddToCart")}
    </button>
  );
}
