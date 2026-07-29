"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AppShell } from "@/widgets/layout/AppShell";
import { formatCop, getProductById } from "@/shared/config/products";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type CheckoutPhase = "form" | "loading" | "done";

function fakeOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `DC-${stamp.slice(-5)}${rand}`;
}

export default function CheckoutPage() {
  const { t, language } = useSiteLanguage();
  const { state, dispatch, subtotal } = useCart();
  const [phase, setPhase] = useState<CheckoutPhase>("form");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const locale = language === "en" ? "en-US" : "es-CO";

  const lines = useMemo(
    () =>
      state.lines
        .map((line) => {
          const product = getProductById(line.productId);
          if (!product) return null;
          return { ...line, product };
        })
        .filter(Boolean),
    [state.lines],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (lines.length === 0) {
      setError(t("shopCheckoutEmptyError"));
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    if (!name || !email || !phone || !city) {
      setError(t("shopCheckoutFormError"));
      return;
    }

    // SIMULADO: reemplazar con Stripe/MercadoPago antes de producción
    setPhase("loading");
    startTransition(() => {
      window.setTimeout(() => {
        const id = fakeOrderId();
        setOrderId(id);
        try {
          const raw = window.sessionStorage.getItem("danniel_shop_orders");
          const prev = raw ? (JSON.parse(raw) as unknown[]) : [];
          window.sessionStorage.setItem(
            "danniel_shop_orders",
            JSON.stringify([
              {
                id,
                createdAt: new Date().toISOString(),
                name,
                email,
                phone,
                city,
                total: subtotal,
                items: lines.map((line) => ({
                  productId: line!.productId,
                  quantity: line!.quantity,
                  title: line!.product.title,
                })),
                status: "Pagada/Agendada",
              },
              ...(Array.isArray(prev) ? prev : []),
            ]),
          );
        } catch {
          /* ignore storage errors in prototype */
        }
        dispatch({ type: "CLEAR" });
        setPhase("done");
      }, 1400);
    });
  };

  if (phase === "done") {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            {t("shopCheckoutDoneTag")}
          </p>
          <h1
            className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-none"
            style={{ fontFamily: "var(--font-stack-lettering)" }}
          >
            {t("shopCheckoutDoneTitle")}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            {t("shopCheckoutDoneBody")}
          </p>
          <p className="mt-6 font-mono text-sm text-[rgba(var(--rgb-sand),0.95)]">
            {t("shopOrderNumber")}: {orderId}
          </p>
          <Link
            href="/tienda"
            className="mt-8 inline-flex min-h-12 items-center border border-white/15 px-5 text-sm font-semibold transition active:scale-[0.98]"
          >
            {t("shopBackToStore")}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="max-w-xl">
        <p className="typo-eyebrow typo-eyebrow-muted">{t("shopCheckoutTag")}</p>
        <h1 className="typo-section-sm mt-2">{t("shopCheckoutTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t("shopCheckoutBody")}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_0.85fr]">
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <label className="grid gap-2 text-sm">
            <span>{t("shopFieldName")}</span>
            <input
              name="name"
              required
              className="min-h-11 border border-white/12 bg-[#0c0a08] px-3 text-zinc-100 outline-none focus:border-[rgba(var(--rgb-camel),0.45)]"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{t("shopFieldEmail")}</span>
            <input
              name="email"
              type="email"
              required
              className="min-h-11 border border-white/12 bg-[#0c0a08] px-3 text-zinc-100 outline-none focus:border-[rgba(var(--rgb-camel),0.45)]"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{t("shopFieldPhone")}</span>
            <input
              name="phone"
              required
              className="min-h-11 border border-white/12 bg-[#0c0a08] px-3 text-zinc-100 outline-none focus:border-[rgba(var(--rgb-camel),0.45)]"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>{t("shopFieldCity")}</span>
            <input
              name="city"
              required
              className="min-h-11 border border-white/12 bg-[#0c0a08] px-3 text-zinc-100 outline-none focus:border-[rgba(var(--rgb-camel),0.45)]"
            />
            <span className="text-xs text-zinc-600">{t("shopFieldCityHint")}</span>
          </label>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={phase === "loading" || pending}
            className="mt-2 min-h-12 border border-[rgba(var(--rgb-camel),0.35)] bg-[rgba(var(--rgb-cacao),0.55)] px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60"
          >
            {phase === "loading" ? t("shopCheckoutLoading") : t("shopCheckoutSubmit")}
          </button>
        </form>

        <aside className="border border-white/10 bg-[#120e0b] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            {t("shopOrderSummary")}
          </p>
          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">{t("shopCartEmpty")}</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {lines.map((line) => (
                <li key={line!.productId} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-zinc-200">
                    {line!.product.title} × {line!.quantity}
                  </span>
                  <span className="font-mono text-zinc-400">
                    {line!.product.price == null
                      ? t("shopPricePending")
                      : formatCop(line!.product.price * line!.quantity, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
            <span className="text-zinc-400">{t("shopSubtotal")}</span>
            <span className="font-mono font-semibold">{formatCop(subtotal, locale)}</span>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
