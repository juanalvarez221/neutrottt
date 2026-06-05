"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent } from "react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  getQuoteDraft,
  isLargeQuoteSize,
  saveQuoteDraft,
} from "@/shared/lib/quoteDraft";
import { getQuoteConnection } from "@/shared/lib/quoteConnection";

export function QuoteReferenceStep({ size, zone }: { size: string; zone: string }) {
  const router = useRouter();
  const { language, t } = useSiteLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isLarge = isLargeQuoteSize(size);

  useEffect(() => {
    if (!getQuoteConnection()) {
      router.replace("/cotizacion/conexion");
      return;
    }
    if (!zone.trim()) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
    }
  }, [router, size, zone]);

  const pickFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreview = URL.createObjectURL(file);
    setReferenceFile(file);
    setPreviewUrl(nextPreview);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    pickFile(file);
  };

  const onDropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    pickFile(file);
  };

  const clearFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setReferenceFile(null);
    setPreviewUrl(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const onContinue = () => {
    saveQuoteDraft({ size, zone, notes: "" });
    if (isLarge) {
      router.push(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`);
      return;
    }
    router.push(
      `/cotizacion/confirmacion?size=${encodeURIComponent(size)}&zone=${encodeURIComponent(zone)}`,
    );
  };

  const backHref = `/cotizacion/ubicacion?size=${encodeURIComponent(size)}`;

  return (
    <QuoteShell>
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteReferenceStep")}
        </p>
        <h2 className="typo-section text-[2.2rem] leading-[1.05] md:text-[3.2rem]">
          {t("quoteReferenceTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteReferenceTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {isLarge ? t("quoteReferenceBodyLarge") : t("quoteReferenceBody")}
        </p>
        {isLarge ? (
          <p className="typo-tech mt-3 text-xs uppercase tracking-[0.14em] text-amber-200/75">
            {t("quoteReferenceLargeNotice")}
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-600/10">
              <span className="text-[10px] font-bold text-white">5</span>
            </div>
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              {t("quoteReferenceVisualCard")}
            </h3>
            <span className="typo-tech rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
              {language === "en" ? "Optional" : "Opcional"}
            </span>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDropFile}
            className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4"
          >
            <input
              ref={inputRef}
              id="quote-reference-file"
              type="file"
              accept="image/*"
              onChange={onInputChange}
              className="hidden"
            />

            {previewUrl ? (
              <div className="space-y-3">
                <div className="relative mx-auto h-52 w-full max-w-sm overflow-hidden rounded-xl border border-white/15">
                  <Image
                    src={previewUrl}
                    alt={language === "en" ? "Reference preview" : "Vista previa de referencia"}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-100">{referenceFile?.name}</p>
                  <p className="text-xs text-zinc-400">
                    {referenceFile
                      ? `${(referenceFile.size / 1024 / 1024).toFixed(2)} MB`
                      : language === "en"
                        ? "Optional file"
                        : "Archivo opcional"}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10"
                  >
                    {language === "en" ? "Change image" : "Cambiar imagen"}
                  </button>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-500/15"
                  >
                    {language === "en" ? "Remove" : "Quitar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-36 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl border border-white/10 bg-white/5" />
                  <p className="mt-3 text-sm font-semibold text-zinc-50">{t("quoteReferenceUpload")}</p>
                  <p className="mt-1 text-xs text-zinc-400">{t("quoteReferenceVisualHint")}</p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-4 rounded-xl border border-amber-500/35 bg-amber-600/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-600/20"
                  >
                    {language === "en" ? "Select image" : "Seleccionar imagen"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </Link>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-700 to-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]"
        >
          {isLarge ? t("quoteReferenceNextLarge") : t("quoteReferenceNextSmall")}
        </button>
      </div>
    </QuoteShell>
  );
}
