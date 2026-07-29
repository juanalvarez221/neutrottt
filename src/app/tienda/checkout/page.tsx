"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AppShell } from "@/widgets/layout/AppShell";
import { getCheckoutCountry } from "@/shared/config/checkoutGeo";
import { resolveCheckoutRequirements } from "@/shared/lib/checkoutRequirements";
import { useCart } from "@/shared/lib/cart";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  CheckoutBuyerForm,
  type CheckoutBuyerValues,
} from "@/widgets/shop/CheckoutBuyerForm";
import {
  CheckoutOrderPanel,
  resolveCheckoutLines,
} from "@/widgets/shop/CheckoutOrderPanel";

type CheckoutPhase = "form" | "loading" | "done";

function fakeOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `DC-${stamp.slice(-5)}${rand}`;
}

const INITIAL_BUYER: CheckoutBuyerValues = {
  email: "",
  name: "",
  docType: "cc",
  docNumber: "",
  phoneDial: "+57",
  phoneLocal: "",
  countryIso: "co",
  department: "",
  city: "",
  address: "",
  deliveryNotes: "",
};

export default function CheckoutPage() {
  const { t, language } = useSiteLanguage();
  const { state, dispatch, subtotal } = useCart();
  const [phase, setPhase] = useState<CheckoutPhase>("form");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [buyer, setBuyer] = useState<CheckoutBuyerValues>(INITIAL_BUYER);
  const [pending, startTransition] = useTransition();

  const lines = useMemo(
    () => resolveCheckoutLines(state.lines),
    [state.lines],
  );

  const requirements = useMemo(
    () => resolveCheckoutRequirements(lines.map((line) => line.product)),
    [lines],
  );

  const headerCopy = useMemo(() => {
    if (requirements.profile === "physical") {
      return {
        title: t("shopCheckoutPhysicalTitle"),
        body: t("shopCheckoutPhysicalBody"),
      };
    }
    if (requirements.profile === "mixed") {
      return {
        title: t("shopCheckoutMixedTitle"),
        body: t("shopCheckoutMixedBody"),
      };
    }
    return {
      title: t("shopCheckoutDigitalTitle"),
      body: t("shopCheckoutDigitalBody"),
    };
  }, [requirements.profile, t]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (lines.length === 0) {
      setError(t("shopCheckoutEmptyError"));
      return;
    }

    const email = buyer.email.trim().toLowerCase();
    const name = buyer.name.trim();
    const docType = buyer.docType.trim();
    const docNumber = buyer.docNumber.trim();
    const phoneLocal = buyer.phoneLocal.trim().replace(/\D/g, "");
    const department = buyer.department.trim();
    const city = buyer.city.trim();
    const address = buyer.address.trim();
    const deliveryNotes = buyer.deliveryNotes.trim();
    const isColombia = buyer.countryIso === "co";
    const country = getCheckoutCountry(buyer.countryIso);
    const phone = `${buyer.phoneDial} ${phoneLocal}`.trim();
    const digitalOnly = requirements.profile === "digital";
    const needsShipping = requirements.needsShipping;

    if (digitalOnly) {
      if (!email || !email.includes("@")) {
        setError(t("shopCheckoutFormError"));
        return;
      }
    } else {
      const baseOk =
        name &&
        email &&
        docType &&
        docNumber &&
        phoneLocal &&
        city &&
        (!isColombia || department);

      if (!baseOk || (needsShipping && !address)) {
        setError(t("shopCheckoutFormError"));
        return;
      }
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
                profile: requirements.profile,
                name: digitalOnly ? null : name,
                email,
                phone: digitalOnly ? null : phone,
                docType: digitalOnly ? null : docType,
                docNumber: digitalOnly ? null : docNumber,
                countryIso: digitalOnly ? null : country.iso,
                countryName: digitalOnly
                  ? null
                  : language === "en"
                    ? country.en
                    : country.es,
                department: digitalOnly ? null : isColombia ? department : null,
                city: digitalOnly ? null : city,
                address: needsShipping ? address : null,
                deliveryNotes: needsShipping ? deliveryNotes || null : null,
                total: subtotal,
                items: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  title: line.product.title,
                  fulfillment: line.product.fulfillment,
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
          <h1 className="typo-gothic mt-3 text-[clamp(2.15rem,4.5vw,3.2rem)] text-[rgba(var(--rgb-sand),0.96)]">
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
        <h1 className="typo-section-sm mt-2">{headerCopy.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{headerCopy.body}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.8fr] lg:items-start">
        <form onSubmit={onSubmit} className="grid gap-5" noValidate>
          <CheckoutBuyerForm
            values={buyer}
            profile={requirements.profile}
            onChange={(patch) => setBuyer((prev) => ({ ...prev, ...patch }))}
          />

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={phase === "loading" || pending}
            className="btn-accent typo-cta mt-1 min-h-12 rounded-xl px-4 text-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            {phase === "loading" ? t("shopCheckoutLoading") : t("shopCheckoutSubmit")}
          </button>
        </form>

        <CheckoutOrderPanel lines={lines} />
      </div>
    </AppShell>
  );
}
