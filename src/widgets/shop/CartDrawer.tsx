"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { formatCop, formatProductPrice, getProductById } from "@/shared/config/products";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export function CartDrawer() {
  const { t, language } = useSiteLanguage();
  const { state, dispatch, subtotal, itemCount } = useCart();
  const reduceMotion = useReducedMotion();
  const locale = language === "en" ? "en-US" : "es-CO";
  const pendingLabel = t("shopPricePending");
  const isOpen = state.isOpen;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "CLOSE" });
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, dispatch]);

  const close = () => dispatch({ type: "CLOSE" });

  const spring = reduceMotion
    ? { duration: 0.01 }
    : { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.85 };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="cart-root"
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
        >
          <button
            type="button"
            className="absolute inset-0 z-0 bg-[rgba(8,6,7,0.72)] backdrop-blur-[2px]"
            aria-label={t("shopCartClose")}
            onClick={close}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t("shopCart")}
            className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-[rgba(var(--rgb-sand),0.14)] bg-[#120c0e] shadow-[-24px_0_60px_rgba(0,0,0,0.55)]"
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[rgba(var(--rgb-sand),0.12)] px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(var(--rgb-ivory),0.45)]">
                    {t("shopCart")}
                  </p>
                  <AnimatePresence mode="popLayout">
                    {itemCount > 0 ? (
                      <motion.span
                        key={itemCount}
                        initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.7, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 18 }}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgba(var(--rgb-terracotta),0.95)] px-1.5 font-mono text-[10px] font-bold text-[rgba(var(--rgb-ivory),0.96)]"
                      >
                        {itemCount > 99 ? "99+" : itemCount}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
                <h2 className="typo-gothic mt-1 truncate text-xl text-[rgba(var(--rgb-sand),0.95)]">
                  Danniel Cuervo
                </h2>
              </div>

              <motion.button
                type="button"
                onClick={close}
                whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: 90 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="relative z-20 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--rgb-sand),0.22)] bg-[rgba(255,255,255,0.04)] text-[rgba(var(--rgb-ivory),0.88)] transition hover:border-[rgba(var(--rgb-sand),0.4)] hover:bg-[rgba(255,255,255,0.08)]"
                aria-label={t("shopCartClose")}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </motion.button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              {state.lines.length === 0 ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-center"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(var(--rgb-sand),0.16)] text-[rgba(var(--rgb-sand),0.55)]">
                    <ShoppingBag className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <p className="max-w-[22ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.45)]">
                    {t("shopCartEmpty")}
                  </p>
                </motion.div>
              ) : (
                <LayoutGroup>
                  <ul className="grid gap-3">
                    <AnimatePresence initial={false} mode="popLayout">
                      {state.lines.map((line, index) => {
                        const product = getProductById(line.productId);
                        if (!product) return null;
                        return (
                          <motion.li
                            key={line.productId}
                            layout
                            initial={
                              reduceMotion ? false : { opacity: 0, x: 28, scale: 0.97 }
                            }
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={
                              reduceMotion
                                ? { opacity: 0 }
                                : { opacity: 0, x: 40, scale: 0.96 }
                            }
                            transition={{
                              ...spring,
                              delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.16),
                            }}
                            className="grid grid-cols-[4.5rem_1fr] gap-3 rounded-xl border border-[rgba(var(--rgb-sand),0.1)] bg-[rgba(255,255,255,0.02)] p-2.5"
                          >
                            <div className="relative flex aspect-square overflow-hidden rounded-lg bg-[#1a1410] text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                              {product.image ? (
                                <Image
                                  src={product.image}
                                  alt={product.title}
                                  fill
                                  sizes="72px"
                                  className={
                                    product.type === "course"
                                      ? "object-contain p-1"
                                      : "object-cover"
                                  }
                                />
                              ) : (
                                <span className="m-auto">{t("shopPlaceholderHint")}</span>
                              )}
                            </div>
                            <div className="min-w-0 py-0.5 pr-1">
                              <p className="truncate text-sm font-semibold text-[rgba(var(--rgb-ivory),0.94)]">
                                {product.title}
                              </p>
                              <p className="mt-1 font-mono text-xs text-[rgba(var(--rgb-sand),0.65)]">
                                {formatProductPrice(product, locale, pendingLabel)}
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.9 }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.18)] text-[rgba(var(--rgb-ivory),0.8)] transition hover:border-[rgba(var(--rgb-sand),0.35)]"
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
                                </motion.button>
                                <motion.span
                                  key={`${line.productId}-${line.quantity}`}
                                  initial={reduceMotion ? false : { y: 6, opacity: 0 }}
                                  animate={{ y: 0, opacity: 1 }}
                                  className="min-w-6 text-center font-mono text-sm tabular-nums text-[rgba(var(--rgb-ivory),0.9)]"
                                >
                                  {line.quantity}
                                </motion.span>
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.9 }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.18)] text-[rgba(var(--rgb-ivory),0.8)] transition hover:border-[rgba(var(--rgb-sand),0.35)]"
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
                                </motion.button>
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
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </LayoutGroup>
              )}
            </div>

            <footer className="border-t border-[rgba(var(--rgb-sand),0.12)] px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[rgba(var(--rgb-ivory),0.45)]">{t("shopSubtotal")}</span>
                <motion.span
                  key={subtotal}
                  initial={reduceMotion ? false : { y: 8, opacity: 0.4 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="font-mono font-semibold text-[rgba(var(--rgb-sand),0.95)]"
                >
                  {formatCop(subtotal, locale)}
                </motion.span>
              </div>
              <Link
                href="/tienda/checkout"
                onClick={close}
                className={`btn-accent typo-cta mt-4 flex min-h-12 items-center justify-center rounded-xl px-4 text-sm transition active:scale-[0.98] ${
                  state.lines.length === 0
                    ? "pointer-events-none opacity-40"
                    : ""
                }`}
              >
                {t("shopCheckoutCta")}
              </Link>
            </footer>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
