"use client";

import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import {
  formatCop,
  formatProductPrice,
  getCartUpsellCandidates,
  getProductById,
  type Product,
} from "@/shared/config/products";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type CheckoutLine = {
  productId: string;
  quantity: number;
  product: Product;
};

export function CheckoutOrderPanel({ lines }: { lines: CheckoutLine[] }) {
  const { t, language } = useSiteLanguage();
  const { dispatch, subtotal, state } = useCart();
  const locale = language === "en" ? "en-US" : "es-CO";
  const pendingLabel = t("shopPricePending");

  const upsells = getCartUpsellCandidates(
    state.lines.map((line) => line.productId),
    3,
  );

  return (
    <aside className="rounded-2xl border border-[rgba(var(--rgb-sand),0.12)] bg-[#120e0b] p-5 lg:sticky lg:top-28">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {t("shopOrderSummary")}
      </p>

      {lines.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">{t("shopCartEmpty")}</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {lines.map((line) => {
            const product = line.product;
            const lineTotal =
              product.price == null ? null : product.price * line.quantity;

            return (
              <li
                key={line.productId}
                className="grid grid-cols-[3.25rem_1fr] gap-3 border-b border-[rgba(var(--rgb-sand),0.08)] pb-4 last:border-b-0 last:pb-0"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[#1a1410]">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.title}
                      fill
                      sizes="52px"
                      className={
                        product.type === "course" ? "object-contain p-0.5" : "object-cover"
                      }
                    />
                  ) : null}
                </div>

                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[rgba(var(--rgb-ivory),0.92)]">
                        {product.title}
                      </p>
                      <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[rgba(var(--rgb-sand),0.45)]">
                        {product.fulfillment === "physical"
                          ? t("shopFulfillmentPhysical")
                          : t("shopFulfillmentDigital")}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-[rgba(var(--rgb-sand),0.75)]">
                      {lineTotal == null
                        ? pendingLabel
                        : formatCop(lineTotal, locale)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.18)] text-[rgba(var(--rgb-ivory),0.8)] transition hover:border-[rgba(var(--rgb-sand),0.35)] active:scale-[0.96]"
                      onClick={() =>
                        dispatch({
                          type: "SET_QTY",
                          productId: line.productId,
                          quantity: line.quantity - 1,
                        })
                      }
                      aria-label={t("shopQtyDecrease")}
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <span className="min-w-6 text-center font-mono text-sm tabular-nums text-[rgba(var(--rgb-ivory),0.9)]">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.18)] text-[rgba(var(--rgb-ivory),0.8)] transition hover:border-[rgba(var(--rgb-sand),0.35)] active:scale-[0.96]"
                      onClick={() =>
                        dispatch({
                          type: "SET_QTY",
                          productId: line.productId,
                          quantity: line.quantity + 1,
                        })
                      }
                      aria-label={t("shopQtyIncrease")}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="ml-auto text-xs text-[rgba(var(--rgb-ivory),0.4)] underline-offset-2 transition hover:text-[rgba(var(--rgb-terracotta),0.9)] hover:underline"
                      onClick={() =>
                        dispatch({ type: "REMOVE", productId: line.productId })
                      }
                    >
                      {t("shopRemove")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
        <span className="text-zinc-400">{t("shopSubtotal")}</span>
        <span className="font-mono font-semibold">{formatCop(subtotal, locale)}</span>
      </div>

      {upsells.length > 0 ? (
        <div className="mt-6 border-t border-[rgba(var(--rgb-sand),0.1)] pt-5">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.4)]">
            {t("shopUpsellTitle")}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-[rgba(var(--rgb-ivory),0.42)]">
            {t("shopUpsellBody")}
          </p>
          <ul className="mt-4 grid gap-2.5">
            {upsells.map((product) => (
              <li
                key={product.id}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[rgba(var(--rgb-sand),0.1)] bg-[rgba(255,255,255,0.02)] px-2.5 py-2 sm:gap-3"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#1a1410]">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt=""
                      fill
                      sizes="44px"
                      className={
                        product.type === "course" ? "object-contain p-0.5" : "object-cover"
                      }
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[rgba(var(--rgb-ivory),0.88)]">
                    {product.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.65rem] text-[rgba(var(--rgb-sand),0.55)]">
                    {formatProductPrice(product, locale, pendingLabel)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "ADD", productId: product.id, open: false })
                  }
                  className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[rgba(var(--rgb-sand),0.2)] px-3 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[rgba(var(--rgb-sand),0.75)] transition hover:border-[rgba(var(--rgb-sand),0.4)] hover:text-[rgba(var(--rgb-sand),0.95)] active:scale-[0.97]"
                >
                  {t("shopUpsellAdd")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

/** Resolve cart lines for checkout; drops unknown IDs. */
export function resolveCheckoutLines(productIds: { productId: string; quantity: number }[]) {
  return productIds
    .map((line) => {
      const product = getProductById(line.productId);
      if (!product) return null;
      return { ...line, product };
    })
    .filter(Boolean) as CheckoutLine[];
}
