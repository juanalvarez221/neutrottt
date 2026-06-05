"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { Check, ArrowRight } from "lucide-react";
import { getQuoteConnection } from "@/shared/lib/quoteConnection";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type SizeOption = "pequeno" | "mediano" | "grande";

export default function CotizacionTamanoPage() {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const [size, setSize] = useState<SizeOption>("mediano");

  useEffect(() => {
    if (!getQuoteConnection()) {
      router.replace("/cotizacion/conexion");
    }
  }, [router]);

  const options = useMemo(
    () =>
      [
        {
          id: "pequeno" as const,
          label: "Pequeño",
          detail: "(6-10 cm)",
          img: "/quote-sizes/small-reference.png",
        },
        {
          id: "mediano" as const,
          label: "Mediano",
          detail: "(15-25 cm)",
          img: "/quote-sizes/medium-reference.png",
        },
        {
          id: "grande" as const,
          label: "Grande",
          detail: "(35-55 cm)",
          img: "/quote-sizes/large-reference.png",
        },
      ] satisfies Array<{
        id: SizeOption;
        label: string;
        detail: string;
        img: string;
      }>,
    [],
  );

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteSizeStep")}
        </p>
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          {t("quoteSizeTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteSizeTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {size === "grande" ? t("quoteSizeBodyLarge") : t("quoteSizeBody")}
        </p>
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-600/10">
            <span className="text-[10px] font-bold text-white">3</span>
          </div>
          <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
            Tamaño aproximado
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {options.map((o) => {
            const selected = size === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSize(o.id)}
                className={[
                  "relative overflow-hidden rounded-xl p-4 transition-all duration-300",
                  selected ? "glass-card-selected scale-[1.03]" : "glass-card",
                  !selected ? "hover:-translate-y-1" : "",
                ].join(" ")}
              >
                <div className="relative">
                  <div
                    className={[
                      "relative mb-4 aspect-square max-h-44 w-full overflow-hidden rounded-lg border md:max-h-48",
                      selected
                        ? "border-amber-500/30 bg-black/60"
                        : "border-white/5 bg-black/40",
                    ].join(" ")}
                  >
                    <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <Image
                      src={o.img}
                      alt={o.label}
                      fill
                      className={[
                        "object-cover transition duration-500",
                        selected ? "scale-105 brightness-110" : "opacity-70",
                      ].join(" ")}
                    />
                    {selected ? (
                      <span className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>

                  <div className="text-center">
                    <span className="block text-xs font-bold uppercase tracking-wider text-white">
                      {o.label}
                    </span>
                    <span
                      className={[
                        "mt-1 block text-sm font-semibold",
                        selected ? "text-amber-200/80" : "text-zinc-300/80",
                      ].join(" ")}
                    >
                      {o.detail}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <button
          type="button"
          onClick={() => router.push("/cotizacion/conexion")}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/cotizacion/ubicacion?size=${size}`)}
          className="group inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-6 py-3 text-[14px] font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)] active:translate-y-0"
        >
          {t("quoteContinue")}
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}

