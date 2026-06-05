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
const AXIS_THRESHOLD = 10;

type DragAxis = "undecided" | "horizontal" | "vertical";

export function AboutProcessCarousel() {
  const { t } = useSiteLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const setWidthRef = useRef(0);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const axisRef = useRef<DragAxis>("undecided");
  const pointerStartX = useRef(0);
  const pointerStartY = useRef(0);
  const offsetAtDragStart = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHorizontalDrag, setIsHorizontalDrag] = useState(false);

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

  const finishDrag = useCallback(() => {
    draggingRef.current = false;
    pausedRef.current = false;
    axisRef.current = "undecided";
    setIsHorizontalDrag(false);
    normalizeOffset();
    applyTransform();
    updateActiveIndex();
  }, [applyTransform, normalizeOffset, updateActiveIndex]);

  const applyDragDelta = useCallback(
    (clientX: number) => {
      const delta = clientX - pointerStartX.current;
      offsetRef.current = offsetAtDragStart.current + delta;
      applyTransform();
      updateActiveIndex();
    },
    [applyTransform, updateActiveIndex],
  );

  const beginInteraction = useCallback((clientX: number, clientY: number) => {
    axisRef.current = "undecided";
    pointerStartX.current = clientX;
    pointerStartY.current = clientY;
    offsetAtDragStart.current = offsetRef.current;
  }, []);

  const resolveAxis = useCallback((clientX: number, clientY: number) => {
    const dx = clientX - pointerStartX.current;
    const dy = clientY - pointerStartY.current;

    if (Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) {
      return null;
    }

    if (Math.abs(dy) > Math.abs(dx)) {
      axisRef.current = "vertical";
      return "vertical" as const;
    }

    axisRef.current = "horizontal";
    draggingRef.current = true;
    pausedRef.current = true;
    setIsHorizontalDrag(true);
    return "horizontal" as const;
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

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      beginInteraction(event.touches[0].clientX, event.touches[0].clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      if (axisRef.current === "vertical") return;

      const touch = event.touches[0];
      if (axisRef.current === "undecided") {
        const axis = resolveAxis(touch.clientX, touch.clientY);
        if (axis !== "horizontal") return;
      }

      event.preventDefault();
      applyDragDelta(touch.clientX);
    };

    const onTouchEnd = () => {
      if (axisRef.current === "horizontal") finishDrag();
      else axisRef.current = "undecided";
    };

    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchmove", onTouchMove, { passive: false });
    track.addEventListener("touchend", onTouchEnd);
    track.addEventListener("touchcancel", onTouchEnd);

    return () => {
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchmove", onTouchMove);
      track.removeEventListener("touchend", onTouchEnd);
      track.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyDragDelta, beginInteraction, finishDrag, resolveAxis]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    beginInteraction(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (axisRef.current === "vertical") return;

    if (axisRef.current === "undecided") {
      const axis = resolveAxis(e.clientX, e.clientY);
      if (axis === "horizontal") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (axis !== "horizontal") return;
    }

    applyDragDelta(e.clientX);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (axisRef.current === "horizontal") {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      finishDrag();
      return;
    }
    axisRef.current = "undecided";
  };

  return (
    <div className="mt-8 sm:mt-10">
      <div
        className="about-process-carousel-viewport page-bleed-x relative cursor-grab overflow-hidden active:cursor-grabbing"
        aria-roledescription="carrusel"
        aria-label={t("aboutProcessLabel")}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#080605] to-transparent sm:w-12 md:w-16" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[#080605] to-transparent sm:w-12 md:w-16" />

        <div
          ref={trackRef}
          className={`about-process-carousel-track flex gap-4 will-change-transform select-none ${
            isHorizontalDrag ? "is-horizontal-drag" : ""
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={() => {
            if (draggingRef.current) finishDrag();
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
                <p className="typo-caption leading-snug">{t(slide.captionKey)}</p>
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
