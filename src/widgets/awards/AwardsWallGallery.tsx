"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AWARDS, AWARDS_CLAIM_COUNT } from "@/shared/config/awards";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import { MediaLightboxPortal } from "@/shared/ui/MediaLightboxPortal";

gsap.registerPlugin(useGSAP, ScrollTrigger);

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AwardsWallGallery() {
  const { t } = useSiteLanguage();
  const rootRef = useRef<HTMLElement>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const index = AWARDS.findIndex((award) => award.id === hash);
    if (index < 0) return;

    const target = document.getElementById(hash);
    requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      setDetailIndex(index);
    });
  }, []);

  useEffect(() => {
    if (detailIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailIndex(null);
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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailIndex]);

  useGSAP(
    () => {
      if (reduceMotion) return;

      const root = rootRef.current;
      if (!root) return;

      const items = gsap.utils.toArray<HTMLElement>(
        root.querySelectorAll("[data-wall-item]"),
      );
      if (!items.length) return;

      items.forEach((item, index) => {
        const frame = item.querySelector<HTMLElement>("[data-wall-frame]");
        const cast = item.querySelector<HTMLElement>("[data-wall-cast]");
        const lamp = item.querySelector<HTMLElement>("[data-wall-lamp]");
        if (!frame) return;

        const tilt = index % 2 === 0 ? -6.5 : 6;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: item,
            start: "top 78%",
            once: true,
          },
        });

        tl.fromTo(
          frame,
          {
            autoAlpha: 0,
            y: -64,
            rotate: tilt,
            scale: 0.96,
            transformOrigin: "50% -9%",
          },
          {
            autoAlpha: 1,
            y: 0,
            rotate: tilt * -0.32,
            scale: 1,
            duration: 0.7,
            ease: "power3.out",
          },
        )
          // Balanceo final: el cuadro se asienta en el clavo
          .to(frame, {
            rotate: 0,
            duration: 1.1,
            ease: "elastic.out(1, 0.42)",
          });

        if (cast) {
          tl.fromTo(
            cast,
            { autoAlpha: 0, scaleX: 0.72 },
            { autoAlpha: 1, scaleX: 1, duration: 0.65, ease: "power2.out" },
            0.18,
          );
        }

        if (lamp) {
          tl.fromTo(
            lamp,
            { autoAlpha: 0, scaleY: 0.65 },
            { autoAlpha: 1, scaleY: 1, duration: 0.9, ease: "power2.out" },
            0.1,
          );
        }
      });

      const refresh = () => ScrollTrigger.refresh();
      requestAnimationFrame(refresh);
      const late = window.setTimeout(refresh, 240);
      const onLoad = () => refresh();
      window.addEventListener("load", onLoad);
      return () => {
        window.clearTimeout(late);
        window.removeEventListener("load", onLoad);
      };
    },
    { scope: rootRef, dependencies: [reduceMotion], revertOnUpdate: true },
  );

  const detail = detailIndex !== null ? AWARDS[detailIndex] : null;

  return (
    <>
      <section
        ref={rootRef}
        className="awards-wall"
        aria-labelledby="awards-wall-heading"
      >
        <div className="awards-wall__atmosphere" aria-hidden />

        <header className="awards-wall__intro page-section-pad mx-auto max-w-[1400px]">
          <p className="typo-eyebrow typo-eyebrow-muted">{t("awardsTag")}</p>
          <h1
            id="awards-wall-heading"
            className="typo-gothic mt-3 text-[clamp(2.35rem,7vw,4.25rem)] text-[rgba(var(--rgb-sand),0.96)]"
          >
            {t("hallOfFameTitle")}
          </h1>
          <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-[rgba(var(--rgb-ivory),0.68)] sm:text-[0.95rem]">
            {t("hallOfFameSubtitle")}
          </p>
          <div className="awards-wall__meta mt-6 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-[rgba(var(--rgb-sand),0.14)] pt-5">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.55)]">
              {t("awardsWallScrollHint")}
            </p>
            <p className="ml-auto font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.72)]">
              {String(AWARDS.length).padStart(2, "0")} {t("awardsWallOnWall")}
              <span className="opacity-45"> · {AWARDS_CLAIM_COUNT}+</span>
            </p>
          </div>
        </header>

        <div className="awards-wall__surface page-section-pad mx-auto max-w-[1400px]">
          <ul className="awards-wall__list">
            {AWARDS.map((award, index) => (
              <li
                key={award.id}
                id={award.id}
                data-wall-item
                className={
                  index % 2 === 0
                    ? "awards-wall__item awards-wall__item--left"
                    : "awards-wall__item awards-wall__item--right"
                }
              >
                <div className="awards-wall__hanger">
                  <span
                    className="awards-wall__lamp"
                    data-wall-lamp
                    aria-hidden
                  />
                  <span className="awards-wall__hook" aria-hidden />
                  <svg
                    className="awards-wall__wire"
                    viewBox="0 0 100 14"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <polyline
                      points="2,14 50,1 98,14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <button
                    type="button"
                    data-wall-frame
                    className="awards-wall__frame"
                    onClick={() => setDetailIndex(index)}
                    aria-label={`${award.title}. ${t("hallOfFameOpenFrameAria")}`}
                  >
                    <span className="awards-wall__mat">
                      <span className="awards-wall__photo">
                        <Image
                          src={award.image}
                          alt={award.title}
                          fill
                          sizes="(max-width: 640px) 82vw, (max-width: 1024px) 23rem, 26rem"
                          className="object-cover"
                          priority={index < 2}
                        />
                        <span className="awards-wall__sheen" aria-hidden />
                      </span>
                    </span>
                    <span className="awards-wall__cast" data-wall-cast aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {detail && detailIndex !== null ? (
        <MediaLightboxPortal>
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => setDetailIndex(null)}
            role="presentation"
          >
            <figure
              className="awards-wall__detail relative w-full max-w-lg overflow-hidden border border-[rgba(var(--rgb-sand),0.28)] bg-[#120c0e] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={detail.title}
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
                <div className="awards-wall__sheen" aria-hidden />
              </div>
              <figcaption className="flex items-center justify-end gap-3 border-t border-[rgba(var(--rgb-sand),0.16)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.22)] text-[rgba(var(--rgb-ivory),0.85)] transition hover:border-[rgba(var(--rgb-sand),0.4)] active:scale-[0.98]"
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
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.22)] text-[rgba(var(--rgb-ivory),0.85)] transition hover:border-[rgba(var(--rgb-sand),0.4)] active:scale-[0.98]"
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
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[rgba(var(--rgb-sand),0.22)] text-[rgba(var(--rgb-ivory),0.85)] transition hover:border-[rgba(var(--rgb-sand),0.4)] active:scale-[0.98]"
                    aria-label={t("hallOfFameCloseAria")}
                    onClick={() => setDetailIndex(null)}
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </figcaption>
            </figure>
          </div>
        </MediaLightboxPortal>
      ) : null}
    </>
  );
}
