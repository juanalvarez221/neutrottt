"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { Check, ArrowRight } from "lucide-react";

type SizeOption = "pequeno" | "mediano" | "grande";

export default function CotizacionTamanoPage() {
  const router = useRouter();
  const [size, setSize] = useState<SizeOption>("mediano");

  const options = useMemo(
    () =>
      [
        {
          id: "pequeno" as const,
          label: "Pequeño",
          detail: "(5-10 cm)",
          img: "https://lh3.googleusercontent.com/aida/ADBb0ujIjL5LCbOj9GCrAJNYWGDzYOLARysY8VJNCvyY-t-7ECb2ECsqbxRDeEnn7fx2uc00YjjTAxoWLbENwVzz5pLT4HbRExdJwm_7lt8ijtsVipl5h7JC5ICRPXGwv8UKG-dBc-E6LKKt_iccSDNF2a5qrkeobNGQaLrn-z5yn0tuVJlw1Gm1xwcihQhbVR4nzW-mtej2gpUH-yqPPPmif3AwFWWt2jE8bbZbyII_Iyx5SZZ1m0mtpFUjWQr9puoTw0zUv79XuOm3VQ",
        },
        {
          id: "mediano" as const,
          label: "Mediano",
          detail: "(10-20 cm)",
          img: "https://lh3.googleusercontent.com/aida/ADBb0uhdczglQyCumuzemahLZlA5tvx4ng83u8H8jrFSheEp-ANgzgQUjPGI9LesuLlk_mhA9bSbs4CYxVXJxCJQuk47X8jETtK1zSwt_0VvCzqzgbPJR28moVNZ50Z-DyD7ib80rfjfqXSZlhkebmiRrXFJAyCATVMRze63HOl0Ug1wgCS2RE5dY1aOG2jG7aMctdm71j4ixWQ8uxAKrKlBdcEtSJHbKfbz5-9tvGfd-TyPFd_RidFJNfmunDlFs1PuydnkKPWEP7fMXg",
        },
        {
          id: "grande" as const,
          label: "Grande",
          detail: "(20+ cm)",
          img: "https://lh3.googleusercontent.com/aida/ADBb0uhqAfmKbG80pk0zJGaq5SJ6hb2p4n6S6-RiMY1Zs8fA0LBl1xLDDonA4RRViAadi9VHlhYZiSD55HfxMrSI43NsiEZkWkfZmtV-Olp41eUeCU4hJwiZ-rDz2fzqXrSfpq_u9ziL8EbbfBUUq2us1wGYu0sQ1781mwLEWET8ZA7-fL0qrAmcnwGdlPXajzJj8QockX33jJgo5S6UL8oDPZl4yjVmAzBATUZ9o36kfG9X3B2v8uqlH3Cyvv0JUqqxOdWzM0ZJMJ1htA",
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
    <QuoteShell brand="MALIANTEO">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-violet-600/15 blur-[60px]" />
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          Definamos
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            el tamaño ideal
          </span>
        </h2>
        <p className="typo-body mt-3 max-w-xl">
          Este paso me ayuda a darte una estimación inicial más realista en
          tiempo, sesiones y rango de inversión.
        </p>
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-500/30 bg-violet-600/10">
            <span className="text-[10px] font-bold text-white">1</span>
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
                      "relative mb-4 aspect-square max-h-32 w-full overflow-hidden rounded-lg border",
                      selected
                        ? "border-violet-500/30 bg-black/60"
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
                      <span className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg">
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
                        selected ? "text-violet-200/80" : "text-zinc-300/80",
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
          onClick={() => router.push("/cotizacion")}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => router.push(`/cotizacion/ubicacion?size=${size}`)}
          className="group inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/35 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-[14px] font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.35)] active:translate-y-0"
        >
          Continuar
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </QuoteShell>
  );
}

