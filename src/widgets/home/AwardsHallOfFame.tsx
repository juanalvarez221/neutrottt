"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AWARDS } from "@/shared/config/awards";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { MediaLightboxPortal } from "@/shared/ui/MediaLightboxPortal";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type AwardsHallOfFameProps = {
  open: boolean;
  onClose: () => void;
  focusIndex?: number | null;
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AwardsHallOfFame({
  open,
  onClose,
  focusIndex = null,
}: AwardsHallOfFameProps) {
  const { t } = useSiteLanguage();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const activeIndexRef = useRef(0);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!open) {
      setDetailIndex(null);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailIndex((current) => {
          if (current !== null) return null;
          onClose();
          return null;
        });
        return;
      }
      if (event.key === "ArrowRight") {
        setDetailIndex((prev) =>
          prev === null ? null : (prev + 1) % AWARDS.length,
        );
      }
      if (event.key === "ArrowLeft") {
        setDetailIndex((prev) =>
          prev === null ? null : (prev - 1 + AWARDS.length) % AWARDS.length,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (
      typeof focusIndex === "number" &&
      focusIndex >= 0 &&
      focusIndex < AWARDS.length
    ) {
      setDetailIndex(focusIndex);
    }
  }, [open, focusIndex]);

  useGSAP(
    () => {
      if (!open || reduceMotion) return;

      const scroller = scrollerRef.current;
      const stage = stageRef.current;
      if (!scroller || !stage) return;

      const photos = gsap.utils.toArray<HTMLElement>(
        stage.querySelectorAll("[data-hall-photo]"),
      );
      if (photos.length === 0) return;

      const total = photos.length;
      const syncChrome = (index: number, progress: number) => {
        activeIndexRef.current = index;
        if (counterRef.current) {
          counterRef.current.textContent = String(index + 1).padStart(2, "0");
        }
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${progress})`;
        }
      };

      gsap.set(photos, {
        autoAlpha: 0,
        scale: 1.08,
        yPercent: 14,
        rotate: 0,
      });
      photos.forEach((photo, index) => {
        gsap.set(photo, { zIndex: index + 1 });
      });
      gsap.set(photos[0], {
        autoAlpha: 1,
        scale: 1,
        yPercent: 0,
        rotate: 0,
      });
      syncChrome(0, 0);

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          scroller,
          trigger: stage,
          start: "top top",
          end: () =>
            `+=${Math.max(total * window.innerHeight * 0.72, window.innerHeight * 4)}`,
          pin: true,
          scrub: 0.85,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const idx = Math.min(
              total - 1,
              Math.round(self.progress * (total - 1)),
            );
            syncChrome(idx, self.progress);
          },
        },
      });

      photos.forEach((photo, index) => {
        if (index === 0) return;
        const prev = photos[index - 1];
        const tilt = index % 2 === 0 ? -1.35 : 1.35;

        tl.to(
          prev,
          {
            scale: 0.92,
            yPercent: -4,
            filter: "brightness(0.62)",
            duration: 1,
          },
          index - 1,
        );

        tl.fromTo(
          photo,
          {
            autoAlpha: 0,
            scale: 1.1,
            yPercent: 18,
            rotate: tilt,
            filter: "brightness(1)",
          },
          {
            autoAlpha: 1,
            scale: 1,
            yPercent: 0,
            rotate: 0,
            filter: "brightness(1)",
            duration: 1,
          },
          index - 1,
        );
      });

      const refresh = () => ScrollTrigger.refresh();
      requestAnimationFrame(refresh);
      const lateRefresh = window.setTimeout(refresh, 180);

      return () => {
        window.clearTimeout(lateRefresh);
      };
    },
    {
      scope: rootRef,
      dependencies: [open, reduceMotion],
      revertOnUpdate: true,
    },
  );

  const detail = detailIndex !== null ? AWARDS[detailIndex] : null;

  if (!open) return null;

  return (
    <MediaLightboxPortal>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="hall-of-fame fixed inset-0 z-[90] flex flex-col"
      >
        <div className="hall-of-fame__atmosphere" aria-hidden />

        <header className="relative z-[2] flex shrink-0 items-start justify-between gap-4 border-b border-[rgba(var(--rgb-sand),0.18)] px-4 py-4 sm:px-6 sm:py-5 md:px-10">
          <div className="min-w-0 max-w-2xl">
            <p className="typo-eyebrow typo-eyebrow-muted">{t("awardsTag")}</p>
            <h2
              id={titleId}
              className="typo-gothic mt-2 text-[clamp(2rem,5.5vw,3.25rem)] text-[rgba(var(--rgb-sand),0.96)]"
            >
              {t("hallOfFameTitle")}
            </h2>
            <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.7)]">
              {t("hallOfFameSubtitle")}
            </p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("hallOfFameCloseAria")}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[rgba(var(--rgb-sand),0.28)] bg-[rgba(14,10,11,0.72)] px-3.5 text-sm font-semibold tracking-wide text-[rgba(var(--rgb-ivory),0.92)] backdrop-blur-sm transition hover:border-[rgba(var(--rgb-sand),0.45)] hover:bg-[rgba(var(--rgb-terracotta),0.16)] active:scale-[0.98]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">{t("hallOfFameClose")}</span>
          </button>
        </header>

        <div
          ref={scrollerRef}
          className="hall-of-fame__scroller relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {reduceMotion ? (
            <ul className="hall-of-fame__grid mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 md:px-10">
              {AWARDS.map((award, index) => (
                <li key={award.id} className="hall-of-fame__cell">
                  <button
                    type="button"
                    className="hall-of-fame__frame group w-full text-left"
                    onClick={() => setDetailIndex(index)}
                    aria-label={`${award.title}. ${t("trajectoryCta")}`}
                  >
                    <div className="relative aspect-[3/4] w-full overflow-hidden">
                      <Image
                        src={award.image}
                        alt={award.title}
                        fill
                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
                        className="object-cover"
                      />
                      <div className="hall-of-fame__sheen" aria-hidden />
                      <span className="hall-of-fame__badge" aria-hidden>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div ref={stageRef} className="hall-of-fame__stage">
              <div className="hall-of-fame__stage-inner">
                <p className="hall-of-fame__scroll-hint">{t("hallOfFameScrollHint")}</p>

                <button
                  type="button"
                  className="hall-of-fame__canvas group"
                  onClick={() => setDetailIndex(activeIndexRef.current)}
                  aria-label={t("hallOfFameOpenFrameAria")}
                >
                  <span className="hall-of-fame__mat" aria-hidden />
                  <span className="hall-of-fame__stack">
                    {AWARDS.map((award, index) => (
                      <span
                        key={award.id}
                        data-hall-photo
                        className="hall-of-fame__photo"
                        style={{ zIndex: index + 1 }}
                      >
                        <Image
                          src={award.image}
                          alt={award.title}
                          fill
                          sizes="(max-width: 768px) 86vw, min(520px, 42vw)"
                          className="object-cover"
                          priority={index < 3}
                        />
                        <span className="hall-of-fame__sheen" aria-hidden />
                      </span>
                    ))}
                  </span>
                  <span className="hall-of-fame__frame-edge" aria-hidden />
                </button>

                <div className="hall-of-fame__chrome">
                  <p className="hall-of-fame__counter font-mono">
                    <span ref={counterRef}>01</span>
                    <span className="opacity-45"> / {String(AWARDS.length).padStart(2, "0")}</span>
                  </p>
                  <div className="hall-of-fame__progress" aria-hidden>
                    <span ref={progressRef} className="hall-of-fame__progress-bar" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {detail && detailIndex !== null ? (
          <div
            className="absolute inset-0 z-[3] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => setDetailIndex(null)}
            role="presentation"
          >
            <figure
              className="hall-of-fame__detail relative w-full max-w-lg overflow-hidden border border-[rgba(var(--rgb-sand),0.28)] bg-[#120c0e] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={detail.image}
                  alt={detail.title}
                  fill
                  sizes="(max-width: 768px) 90vw, 480px"
                  className="object-cover"
                  priority
                />
                <div className="hall-of-fame__sheen" aria-hidden />
              </div>
              <figcaption className="flex items-center justify-between gap-3 border-t border-[rgba(var(--rgb-sand),0.16)] px-4 py-3">
                <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.8)]">
                  {String(detailIndex + 1).padStart(2, "0")} /{" "}
                  {String(AWARDS.length).padStart(2, "0")}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.22)] text-[rgba(var(--rgb-ivory),0.85)] transition hover:border-[rgba(var(--rgb-sand),0.4)]"
                    aria-label={t("trajectoryMarqueePrev")}
                    onClick={() =>
                      setDetailIndex(
                        (prev) =>
                          prev === null
                            ? 0
                            : (prev - 1 + AWARDS.length) % AWARDS.length,
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.22)] text-[rgba(var(--rgb-ivory),0.85)] transition hover:border-[rgba(var(--rgb-sand),0.4)]"
                    aria-label={t("trajectoryMarqueeNext")}
                    onClick={() =>
                      setDetailIndex(
                        (prev) => (prev === null ? 0 : (prev + 1) % AWARDS.length),
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.22)] text-[rgba(var(--rgb-ivory),0.85)] transition hover:border-[rgba(var(--rgb-sand),0.4)]"
                    aria-label={t("hallOfFameCloseAria")}
                    onClick={() => setDetailIndex(null)}
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </figcaption>
            </figure>
          </div>
        ) : null}
      </div>
    </MediaLightboxPortal>
  );
}
