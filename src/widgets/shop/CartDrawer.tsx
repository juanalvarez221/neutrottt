"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "framer-motion";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { formatCop, getProductById } from "@/shared/config/products";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

gsap.registerPlugin(useGSAP);

export function CartDrawer() {
  const { t, language } = useSiteLanguage();
  const { state, dispatch, subtotal, itemCount } = useCart();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const locale = language === "en" ? "en-US" : "es-CO";

  useEffect(() => {
    if (!state.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "CLOSE" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isOpen, dispatch]);

  useGSAP(
    () => {
      const root = rootRef.current;
      const panel = panelRef.current;
      if (!root || !panel) return;

      if (reduceMotion) {
        gsap.set(root, {
          autoAlpha: state.isOpen ? 1 : 0,
          pointerEvents: state.isOpen ? "auto" : "none",
        });
        gsap.set(panel, { x: state.isOpen ? 0 : "100%" });
        return;
      }

      if (state.isOpen) {
        gsap.set(root, { pointerEvents: "auto" });
        gsap.fromTo(
          root,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.28, ease: "power2.out", overwrite: "auto" },
        );
        gsap.fromTo(
          panel,
          { x: "100%" },
          { x: 0, duration: 0.42, ease: "power3.out", overwrite: "auto" },
        );
        return;
      }

      const tl = gsap.timeline({
        defaults: { ease: "power2.in", overwrite: "auto" },
        onComplete: () => {
          gsap.set(root, { pointerEvents: "none" });
        },
      });
      tl.to(panel, { x: "100%", duration: 0.32 }, 0);
      tl.to(root, { autoAlpha: 0, duration: 0.24 }, 0);
    },
    { scope: rootRef, dependencies: [state.isOpen, reduceMotion] },
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dispatch({ type: "TOGGLE" })}
        className="fixed bottom-[5.5rem] right-4 z-[60] inline-flex min-h-12 items-center gap-2 border border-white/12 bg-[#1a1410]/px-4 text-sm font-semibold text-[rgba(243,230,215,0.96)] shadow-[0_12px_28px_rgba(0,0,0,0.35)] transition active:scale-[0.98] md:bottom-8"
        aria-label={t("shopCartOpen")}
      >
        <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
        <span>{t("shopCart")}</span>
        {itemCount > 0 ? (
          <span className="font-mono text-xs text-[rgba(var(--rgb-sand),0.9)]">{itemCount}</span>
        ) : null}
      </button>

      <div
        ref={rootRef}
        className="fixed inset-0 z-[70] opacity-0"
        aria-hidden={!state.isOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/70"
          aria-label={t("shopCartClose")}
          onClick={() => dispatch({ type: "CLOSE" })}
        />
        <aside
          ref={panelRef}
          className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/10 bg-[#14100d] shadow-[-18px_0_40px_rgba(0,0,0,0.4)]"
          role="dialog"
          aria-modal="true"
          aria-label={t("shopCart")}
        >
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {t("shopCart")}
              </p>
              <h2
                className="mt-1 text-xl tracking-tight"
                style={{ fontFamily: "var(--font-stack-lettering)" }}
              >
                Danniel Cuervo
              </h2>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "CLOSE" })}
              className="inline-flex h-10 w-10 items-center justify-center border border-white/10 text-zinc-300 transition active:scale-[0.96]"
              aria-label={t("shopCartClose")}
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {state.lines.length === 0 ? (
              <p className="text-sm leading-relaxed text-zinc-500">{t("shopCartEmpty")}</p>
            ) : (
              <ul className="grid gap-4">
                {state.lines.map((line) => {
                  const product = getProductById(line.productId);
                  if (!product) return null;
                  return (
                    <li key={line.productId} className="grid grid-cols-[4.5rem_1fr] gap-3">
                      <div className="relative aspect-square overflow-hidden bg-[#0c0a08]">
                        <Image
                          src={product.image}
                          alt={product.title}
                          fill
                          sizes="72px"
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{product.title}</p>
                        <p className="mt-1 font-mono text-xs text-zinc-400">
                          {formatCop(product.price, locale)}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center border border-white/10 active:scale-[0.96]"
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
                          <span className="font-mono text-sm tabular-nums">{line.quantity}</span>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center border border-white/10 active:scale-[0.96]"
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
                            className="ml-auto text-xs text-zinc-500 underline-offset-2 hover:underline"
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
          </div>

          <footer className="border-t border-white/10 px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{t("shopSubtotal")}</span>
              <span className="font-mono font-semibold text-zinc-100">
                {formatCop(subtotal, locale)}
              </span>
            </div>
            <Link
              href="/tienda/checkout"
              onClick={() => dispatch({ type: "CLOSE" })}
              className={`mt-4 flex min-h-12 items-center justify-center border px-4 text-sm font-semibold transition active:scale-[0.98] ${
                state.lines.length === 0
                  ? "pointer-events-none border-white/5 text-zinc-600"
                  : "border-[rgba(var(--rgb-camel),0.35)] bg-[rgba(var(--rgb-cacao),0.55)] text-[rgba(243,230,215,0.96)]"
              }`}
            >
              {t("shopCheckoutCta")}
            </Link>
          </footer>
        </aside>
      </div>
    </>
  );
}
