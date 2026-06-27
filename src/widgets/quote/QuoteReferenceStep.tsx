"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent } from "react";
import { ImageIcon } from "lucide-react";
import { QuoteShell } from "@/widgets/quote/QuoteShell";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  getQuoteDraft,
  requiresProjectAdvisory,
  saveQuoteDraft,
} from "@/shared/lib/quoteDraft";
import { useQuoteOnboardingGate } from "@/widgets/quote/useQuoteOnboardingGate";

const REFERENCE_NOTE_MAX = 320;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number]);
}

export function QuoteReferenceStep({
  size,
  zone,
  zoneOther = "",
}: {
  size: string;
  zone: string;
  zoneOther?: string;
}) {
  const router = useRouter();
  const { t } = useSiteLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fileError, setFileError] = useState("");
  const isLarge = requiresProjectAdvisory(size);
  const gateReady = useQuoteOnboardingGate();

  useEffect(() => {
    const draft = getQuoteDraft();
    if (draft?.notes) {
      setNote(draft.notes);
    }
  }, []);

  useEffect(() => {
    if (!gateReady) return;
    if (!zone.trim()) {
      router.replace(`/cotizacion/ubicacion?size=${encodeURIComponent(size)}`);
    }
  }, [gateReady, router, size, zone]);

  const pickFile = (file: File | null) => {
    if (!file) return;

    if (!isAcceptedImage(file)) {
      setFileError(t("quoteReferenceImagesOnly"));
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    setFileError("");

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
    setFileError("");
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
    const trimmedNote = note.trim().slice(0, REFERENCE_NOTE_MAX);
    saveQuoteDraft({
      ...(getQuoteDraft() ?? {}),
      size,
      zone,
      zoneOther: zoneOther.trim() || undefined,
      notes: trimmedNote,
    });
    if (isLarge) {
      router.push(`/cotizacion/asesoria?size=${encodeURIComponent(size)}`);
      return;
    }
    const params = new URLSearchParams({ size, zone });
    if (zoneOther.trim()) params.set("zoneOther", zoneOther.trim());
    router.push(`/cotizacion/confirmacion?${params.toString()}`);
  };

  const backHref = `/cotizacion/ubicacion?size=${encodeURIComponent(size)}`;

  return (
    <QuoteShell greetingKey="quoteGreetReference">
      <section className="relative mb-8">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-600/15 blur-[60px]" />
        <p className="typo-tech mb-2 uppercase tracking-[0.16em] text-amber-200/85">
          {t("quoteReferenceStep")}
        </p>
        <h2 className="typo-section quote-step-title">
          {t("quoteReferenceTitle")}
          <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {t("quoteReferenceTitle2")}
          </span>
        </h2>
        <p className="typo-body mt-4 max-w-2xl leading-relaxed">
          {isLarge ? t("quoteReferenceBodyLarge") : t("quoteReferenceBody")}
        </p>
      </section>

      <section className="mb-6">
        <div className="glass-card rounded-2xl p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="typo-subtitle text-sm uppercase tracking-[0.14em] text-zinc-200">
              {t("quoteReferenceVisualCard")}
            </h3>
            <span className="typo-tech rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
              {t("quoteReferenceOptional")}
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
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onInputChange}
              className="hidden"
            />

            {previewUrl ? (
              <div className="space-y-3">
                <div className="relative mx-auto h-52 w-full max-w-sm overflow-hidden rounded-xl border border-white/15">
                  <Image
                    src={previewUrl}
                    alt={t("quoteReferencePreviewAlt")}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-100">{referenceFile?.name}</p>
                  <p className="text-xs text-zinc-400">
                    {referenceFile ? `${(referenceFile.size / 1024 / 1024).toFixed(2)} MB` : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:bg-white/10 active:scale-[0.98]"
                  >
                    {t("quoteReferenceChangeImage")}
                  </button>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-500/15 active:scale-[0.98]"
                  >
                    {t("quoteReferenceRemove")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-36 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <ImageIcon className="h-5 w-5 text-zinc-400" strokeWidth={1.75} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-zinc-50">{t("quoteReferenceUpload")}</p>
                  <p className="mt-1 text-xs text-zinc-400">{t("quoteReferenceVisualHint")}</p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-4 rounded-xl border border-amber-500/35 bg-amber-600/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-600/20 active:scale-[0.98]"
                  >
                    {t("quoteReferenceSelectImage")}
                  </button>
                </div>
              </div>
            )}

            {fileError ? (
              <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {fileError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="glass-card rounded-2xl p-5 md:p-6">
          <label className="block" htmlFor="quote-reference-note">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="connection-step__question">{t("quoteReferenceNoteLabel")}</span>
              <span className="typo-tech rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                {t("quoteReferenceOptional")}
              </span>
            </div>
            <p className="connection-step__hint">{t("quoteReferenceNoteHint")}</p>
            <textarea
              id="quote-reference-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, REFERENCE_NOTE_MAX))}
              rows={4}
              maxLength={REFERENCE_NOTE_MAX}
              placeholder={t("quoteReferenceNotePlaceholder")}
              className="connection-step__textarea mt-3"
            />
            <p className="mt-2 text-right font-mono text-[0.68rem] tracking-[0.12em] text-zinc-500">
              {t("quoteReferenceNoteCounter")
                .replace("{current}", String(note.length))
                .replace("{max}", String(REFERENCE_NOTE_MAX))}
            </p>
          </label>
        </div>
      </section>

      <div className="quote-step-footer mt-6">
        <Link
          href={backHref}
          className="quote-step-footer-back rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-zinc-100 transition hover:bg-white/8"
        >
          {t("commonBack")}
        </Link>
        <button
          type="button"
          onClick={onContinue}
          className="quote-step-footer-next btn-accent focus-ring typo-cta rounded-xl px-6 py-3 active:scale-[0.98]"
        >
          {isLarge ? t("quoteReferenceNextLarge") : t("quoteReferenceNextSmall")}
        </button>
      </div>
    </QuoteShell>
  );
}
