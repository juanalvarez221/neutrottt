"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { LazyVideo } from "@/shared/ui/LazyVideo";

type ProcessSlide =
  | { type: "image"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey };

/** video → foto → video → foto */
const PROCESS_SLIDES: ProcessSlide[] = [
  {
    type: "video",
    src: "/brand/neutro-avion.mp4",
    altKey: "aboutProcessVideoAlt",
    captionKey: "aboutProcessVideoCaption",
  },
  {
    type: "image",
    src: "/brand/about-award.png",
    altKey: "aboutImgAwardAlt",
    captionKey: "aboutProcessCaption1",
  },
  {
    type: "video",
    src: "/brand/neutro-peru.mp4",
    altKey: "aboutProcessPeruVideoAlt",
    captionKey: "aboutProcessCaption3",
  },
  {
    type: "image",
    src: "/brand/about-peru-first.png",
    altKey: "aboutImgPeruAlt",
    captionKey: "aboutProcessCaption4",
  },
  {
    type: "image",
    src: "/brand/about-studio.png",
    altKey: "aboutImgStudioAlt",
    captionKey: "aboutProcessCaption2",
  },
];

const LOOP_SETS = 2;
const MARQUEE_SPEED_PX_S = 54;
const RESUME_AUTO_MS = 3600;
const INERTIA_FRICTION = 0.91;
const INERTIA_MIN_VELOCITY = 0.35;

function ProcessSlideMedia({
  slide,
  isActive,
}: {
  slide: ProcessSlide;
  isActive: boolean;
}) {
  const { t } = useSiteLanguage();

  if (slide.type === "video") {
    return (
      <div className="about-process-media about-process-media--video">
        <LazyVideo
          src={slide.src}
          className="about-process-video"
          playWhenVisible={isActive}
          muted
          loop
          playsInline
          aria-label={t(slide.altKey)}
        />
        <span className="about-process-video__warm-filter" aria-hidden />
        <span className="about-process-video__veil" aria-hidden />
        <span className="about-process-video__edge" aria-hidden />
      </div>
    );
  }

  return (
    <div className="about-process-media about-process-media--image">
      <Image
        src={slide.src}
        alt={t(slide.altKey)}
        fill
        quality={92}
        sizes="(max-width: 639px) 72vw, 340px"
        className="pointer-events-none object-contain object-center"
        draggable={false}
      />
    </div>
  );
}

export function AboutProcessCarousel() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  const setWidthRef = useRef(0);
  const hoverPausedRef = useRef(false);
  const interactionPausedRef = useRef(false);
  const draggingRef = useRef(false);
  const inViewRef = useRef(true);
  const dragStartXRef = useRef(0);
  const dragStartPosRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const dragVelocityRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marqueeRafRef = useRef<number | null>(null);
  const inertiaRafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  const [activeLogicalIndex, setActiveLogicalIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const slideCount = PROCESS_SLIDES.length;

  const loopSlides = useMemo(
    () =>
      Array.from({ length: LOOP_SETS * slideCount }, (_, index) => {
        const slide = PROCESS_SLIDES[index % slideCount];
        return { slide, physicalIndex: index, logicalIndex: index % slideCount };
      }),
    [slideCount],
  );

  const normalizePosition = useCallback(() => {
    const setWidth = setWidthRef.current;
    if (setWidth <= 0) return;
    while (positionRef.current < 0) positionRef.current += setWidth;
    while (positionRef.current >= setWidth) positionRef.current -= setWidth;
  }, []);

  const applyTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(${-positionRef.current}px, 0, 0)`;
  }, []);

  const measureSetWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length < slideCount + 1) return;
    const first = track.children[0] as HTMLElement;
    const secondSet = track.children[slideCount] as HTMLElement;
    setWidthRef.current = secondSet.offsetLeft - first.offsetLeft;
    normalizePosition();
    applyTransform();
  }, [applyTransform, normalizePosition, slideCount]);

  const syncActiveIndex = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || track.children.length === 0) return;

    const viewportCenter = viewport.offsetWidth / 2;
    let closestLogical = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    Array.from(track.children).forEach((child, index) => {
      const el = child as HTMLElement;
      const childCenter =
        el.offsetLeft - positionRef.current + el.offsetWidth / 2;
      const distance = Math.abs(childCenter - viewportCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestLogical = index % slideCount;
      }
    });

    setActiveLogicalIndex(closestLogical);
  }, [slideCount]);

  const isSlideActive = useCallback(
    (physicalIndex: number) => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return false;

      const el = track.children[physicalIndex] as HTMLElement | undefined;
      if (!el) return false;

      const childCenter =
        el.offsetLeft - positionRef.current + el.offsetWidth / 2;
      const viewportCenter = viewport.offsetWidth / 2;
      const threshold = el.offsetWidth * 0.42;

      return Math.abs(childCenter - viewportCenter) < threshold;
    },
    [],
  );

  const pauseFromInteraction = useCallback(() => {
    interactionPausedRef.current = true;
    setIsPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      interactionPausedRef.current = false;
      if (!hoverPausedRef.current && !draggingRef.current) {
        setIsPaused(false);
      }
    }, RESUME_AUTO_MS);
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRafRef.current !== null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }, []);

  const startInertia = useCallback(
    (velocityPxPerMs: number) => {
      stopInertia();
      let velocity = -velocityPxPerMs * 1000;
      if (Math.abs(velocity) < INERTIA_MIN_VELOCITY * 60) return;

      const step = () => {
        if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) {
          inertiaRafRef.current = null;
          return;
        }

        positionRef.current -= velocity / 60;
        velocity *= INERTIA_FRICTION;
        normalizePosition();
        applyTransform();
        syncActiveIndex();
        inertiaRafRef.current = requestAnimationFrame(step);
      };

      inertiaRafRef.current = requestAnimationFrame(step);
    },
    [applyTransform, normalizePosition, stopInertia, syncActiveIndex],
  );

  const nudgeBySlide = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current;
      if (!track) return;

      const activeEl = track.children[activeLogicalIndex] as
        | HTMLElement
        | undefined;
      const step = activeEl?.offsetWidth ?? 320;
      pauseFromInteraction();
      stopInertia();
      positionRef.current += direction * step * 0.92;
      normalizePosition();
      applyTransform();
      syncActiveIndex();
    },
    [
      activeLogicalIndex,
      applyTransform,
      normalizePosition,
      pauseFromInteraction,
      stopInertia,
      syncActiveIndex,
    ],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      stopInertia();
      pauseFromInteraction();
      draggingRef.current = true;
      setIsDragging(true);
      event.currentTarget.classList.add("is-dragging");
      dragStartXRef.current = event.clientX;
      dragStartPosRef.current = positionRef.current;
      lastMoveXRef.current = event.clientX;
      lastMoveTimeRef.current = performance.now();
      dragVelocityRef.current = 0;

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pauseFromInteraction, stopInertia],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;

      const delta = event.clientX - dragStartXRef.current;
      positionRef.current = dragStartPosRef.current - delta;
      normalizePosition();
      applyTransform();

      const now = performance.now();
      const dt = now - lastMoveTimeRef.current;
      if (dt > 0) {
        dragVelocityRef.current = (event.clientX - lastMoveXRef.current) / dt;
      }
      lastMoveXRef.current = event.clientX;
      lastMoveTimeRef.current = now;
      syncActiveIndex();
    },
    [applyTransform, normalizePosition, syncActiveIndex],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;

      draggingRef.current = false;
      setIsDragging(false);
      event.currentTarget.classList.remove("is-dragging");

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      startInertia(dragVelocityRef.current);
      pauseFromInteraction();
    },
    [pauseFromInteraction, startInertia],
  );

  useEffect(() => {
    measureSetWidth();
    syncActiveIndex();

    const track = trackRef.current;
    if (!track) return;

    const ro = new ResizeObserver(() => {
      measureSetWidth();
      syncActiveIndex();
    });

    ro.observe(track);
    return () => ro.disconnect();
  }, [measureSetWidth, syncActiveIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.2 },
    );

    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const tick = (timestamp: number) => {
      if (!lastTickRef.current) lastTickRef.current = timestamp;
      const dt = (timestamp - lastTickRef.current) / 1000;
      lastTickRef.current = timestamp;

      const paused =
        hoverPausedRef.current ||
        interactionPausedRef.current ||
        draggingRef.current ||
        inertiaRafRef.current !== null;

      if (
        !paused &&
        inViewRef.current &&
        setWidthRef.current > 0
      ) {
        const wave = 1 + Math.sin(timestamp * 0.0014) * 0.06;
        positionRef.current -= MARQUEE_SPEED_PX_S * dt * wave;
        normalizePosition();
        applyTransform();
        syncActiveIndex();
      }

      marqueeRafRef.current = requestAnimationFrame(tick);
    };

    marqueeRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (marqueeRafRef.current !== null) {
        cancelAnimationFrame(marqueeRafRef.current);
      }
    };
  }, [
    applyTransform,
    normalizePosition,
    reduceMotion,
    syncActiveIndex,
  ]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      stopInertia();
    };
  }, [stopInertia]);

  return (
    <div className="about-process-carousel mt-6 sm:mt-7">
      <div
        ref={viewportRef}
        className={[
          "about-process-carousel-viewport about-process-carousel-viewport--marquee page-bleed-x relative",
          isPaused ? "about-process-carousel-viewport--paused" : "",
          isDragging ? "about-process-carousel-viewport--dragging" : "",
        ].join(" ")}
        aria-roledescription="carrusel"
        aria-label={t("aboutProcessLabel")}
        onMouseEnter={() => {
          hoverPausedRef.current = true;
          setIsPaused(true);
        }}
        onMouseLeave={() => {
          hoverPausedRef.current = false;
          if (!interactionPausedRef.current && !draggingRef.current) {
            setIsPaused(false);
          }
        }}
      >
        <div
          className="about-process-carousel-fade about-process-carousel-fade--left"
          aria-hidden
        />
        <div
          className="about-process-carousel-fade about-process-carousel-fade--right"
          aria-hidden
        />

        <button
          type="button"
          className="about-process-carousel-nav about-process-carousel-nav--prev"
          onClick={() => nudgeBySlide(-1)}
          aria-label={t("famousGalleryPrev")}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>

        <button
          type="button"
          className="about-process-carousel-nav about-process-carousel-nav--next"
          onClick={() => nudgeBySlide(1)}
          aria-label={t("famousGalleryNext")}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>

        <div
          ref={trackRef}
          className="about-process-carousel-track about-process-carousel-track--marquee"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={(event) => {
            draggingRef.current = false;
            setIsDragging(false);
            event.currentTarget.classList.remove("is-dragging");
          }}
        >
          {loopSlides.map(({ slide, physicalIndex, logicalIndex }) => {
            const isActive = isSlideActive(physicalIndex);

            return (
              <figure
                key={`${physicalIndex}-${slide.src}`}
                className={[
                  "about-process-slide about-process-frame",
                  isActive ? "about-process-slide--active" : "",
                ].join(" ")}
                draggable={false}
                aria-hidden={logicalIndex !== activeLogicalIndex}
              >
                <div className="about-process-frame__media">
                  <ProcessSlideMedia slide={slide} isActive={isActive} />
                </div>
                <figcaption className="about-process-frame__caption">
                  <p>{t(slide.captionKey)}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      <div
        className="page-section-pad mt-4 flex items-center justify-center gap-2"
        role="tablist"
        aria-label={t("aboutProcessLabel")}
      >
        {PROCESS_SLIDES.map((slide, index) => (
          <button
            key={`${slide.type}-${slide.src}-dot`}
            type="button"
            role="tab"
            aria-selected={index === activeLogicalIndex}
            aria-label={t("famousGallerySlide", { index: String(index + 1) })}
            onClick={() => {
              const track = trackRef.current;
              if (!track) return;

              pauseFromInteraction();
              stopInertia();

              const target = track.children[index] as HTMLElement | undefined;
              const viewport = viewportRef.current;
              if (!target || !viewport) return;

              positionRef.current =
                target.offsetLeft +
                target.offsetWidth / 2 -
                viewport.offsetWidth / 2;
              normalizePosition();
              applyTransform();
              syncActiveIndex();
            }}
            className={[
              "about-process-carousel-dot focus-ring",
              index === activeLogicalIndex
                ? "about-process-carousel-dot--active"
                : "",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
