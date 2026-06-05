"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

const PROCESS_SLIDES: {
  src: string;
  altKey: SiteCopyKey;
  captionKey: SiteCopyKey;
}[] = [
  {
    src: "/brand/about-work.png",
    altKey: "aboutImgWorkAlt",
    captionKey: "aboutProcessCaption1",
  },
  {
    src: "/brand/about-award.png",
    altKey: "aboutImgAwardAlt",
    captionKey: "aboutProcessCaption2",
  },
  {
    src: "/brand/about-studio.png",
    altKey: "aboutImgStudioAlt",
    captionKey: "aboutProcessCaption3",
  },
];

const AUTO_SPEED = 0.65;
const DUPLICATES = 2;

export function AboutProcessCarousel() {
  const { t } = useSiteLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const setWidthRef = useRef(0);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const pointerStartX = useRef(0);
  const offsetAtDragStart = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = Array.from({ length: DUPLICATES }, () => PROCESS_SLIDES).flat();

  const normalizeOffset = useCallback(() => {
    const setW = setWidthRef.current;
    if (setW <= 0) return;
    let o = offsetRef.current;
    while (o <= -setW) o += setW;
    while (o > 0) o -= setW;
    offsetRef.current = o;
  }, []);

  const applyTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
  }, []);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    const gap = 16;
    const child = track.children[0] as HTMLElement;
    const slideW = child.offsetWidth + gap;
    setWidthRef.current = slideW * PROCESS_SLIDES.length;
    normalizeOffset();
    applyTransform();
  }, [applyTransform, normalizeOffset]);

  const updateActiveIndex = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    const gap = 16;
    const slideW = (track.children[0] as HTMLElement).offsetWidth + gap;
    if (slideW <= 0) return;
    const raw = Math.round(-offsetRef.current / slideW);
    const idx = ((raw % PROCESS_SLIDES.length) + PROCESS_SLIDES.length) % PROCESS_SLIDES.length;
    setActiveIndex(idx);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useEffect(() => {
    const tick = () => {
      if (!pausedRef.current && !draggingRef.current) {
        offsetRef.current -= AUTO_SPEED;
        normalizeOffset();
        applyTransform();
        updateActiveIndex();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [applyTransform, normalizeOffset, updateActiveIndex]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    pausedRef.current = true;
    pointerStartX.current = e.clientX;
    offsetAtDragStart.current = offsetRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - pointerStartX.current;
    offsetRef.current = offsetAtDragStart.current + delta;
    normalizeOffset();
    applyTransform();
    updateActiveIndex();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    endDrag(e);
    pausedRef.current = false;
  };

  const onPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) {
      endDrag(e);
      pausedRef.current = false;
    }
  };

  return (
    <div className="mt-8 sm:mt-10">
      <div
        className="about-process-carousel-viewport page-bleed-x relative cursor-grab overflow-hidden touch-pan-y active:cursor-grabbing"
        aria-roledescription="carrusel"
        aria-label={t("aboutProcessLabel")}
        onPointerEnter={() => {
          pausedRef.current = true;
        }}
        onPointerLeave={() => {
          if (!draggingRef.current) pausedRef.current = false;
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#080605] to-transparent sm:w-12 md:w-16" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[#080605] to-transparent sm:w-12 md:w-16" />

        <div
          ref={trackRef}
          className="about-process-carousel-track flex touch-none gap-4 will-change-transform select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onLostPointerCapture={() => {
            draggingRef.current = false;
            pausedRef.current = false;
          }}
        >
          {slides.map((slide, i) => (
            <figure
              key={`${slide.src}-${i}`}
              className="about-process-frame flex w-[min(92vw,480px)] shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/90 sm:rounded-2xl"
              draggable={false}
            >
              <div className="relative flex h-[min(78vw,420px)] items-center justify-center bg-black p-3 sm:h-[440px] sm:p-4">
                <Image
                  src={slide.src}
                  alt={t(slide.altKey)}
                  fill
                  quality={92}
                  sizes="420px"
                  className="pointer-events-none object-contain object-center"
                  priority={i < 2}
                  draggable={false}
                />
              </div>
              <figcaption className="border-t border-white/[0.08] bg-black/50 px-4 py-3 text-center">
                <p className="typo-caption leading-snug">
                  {t(slide.captionKey)}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div
        className="page-section-pad mt-4 flex justify-center gap-2"
        role="tablist"
        aria-label={t("aboutProcessLabel")}
      >
        {PROCESS_SLIDES.map((slide, i) => (
          <span
            key={slide.src}
            role="presentation"
            className={`h-1.5 rounded-full transition-all ${
              i === activeIndex ? "w-6 bg-amber-400" : "w-1.5 bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
