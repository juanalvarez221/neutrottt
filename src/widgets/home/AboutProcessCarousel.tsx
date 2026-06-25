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

type ProcessSlide =
  | { type: "image"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey };

type MarqueeFlow = "left" | "right";

/** +1 = contenido fluye hacia la izquierda; -1 = hacia la derecha */
type MarqueeDirection = 1 | -1;

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
const INERTIA_FRICTION = 0.91;
const INERTIA_MIN_VELOCITY = 0.35;
const DIRECTION_VELOCITY_THRESHOLD = 0.1;
const DIRECTION_DELTA_THRESHOLD = 32;

function directionToFlow(direction: MarqueeDirection): MarqueeFlow {
  return direction === 1 ? "left" : "right";
}

function resolveMarqueeDirection(
  pointerDeltaPx: number,
  velocityPxPerMs: number,
): MarqueeDirection | null {
  if (Math.abs(velocityPxPerMs) >= DIRECTION_VELOCITY_THRESHOLD) {
    return velocityPxPerMs > 0 ? -1 : 1;
  }

  if (Math.abs(pointerDeltaPx) >= DIRECTION_DELTA_THRESHOLD) {
    return pointerDeltaPx > 0 ? -1 : 1;
  }

  return null;
}

function ProcessCarouselVideo({
  src,
  label,
  enabled,
}: {
  src: string;
  label: string;
  enabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const ensurePlayback = () => {
      if (!enabled) {
        video.pause();
        return;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        void video.play().catch(() => {});
        return;
      }
      video.load();
      void video.play().catch(() => {});
    };

    ensurePlayback();
    video.addEventListener("loadeddata", ensurePlayback);
    video.addEventListener("canplay", ensurePlayback);

    return () => {
      video.removeEventListener("loadeddata", ensurePlayback);
      video.removeEventListener("canplay", ensurePlayback);
    };
  }, [enabled, src]);

  return (
    <video
      ref={videoRef}
      src={src}
      className="about-process-video"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-label={label}
    />
  );
}

function ProcessSlideMedia({
  slide,
  carouselVideosEnabled,
}: {
  slide: ProcessSlide;
  carouselVideosEnabled: boolean;
}) {
  const { t } = useSiteLanguage();

  if (slide.type === "video") {
    return (
      <div className="about-process-media about-process-media--video">
        <ProcessCarouselVideo
          src={slide.src}
          label={t(slide.altKey)}
          enabled={carouselVideosEnabled}
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
  const draggingRef = useRef(false);
  const inViewRef = useRef(true);
  const dragStartXRef = useRef(0);
  const dragStartPosRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const dragVelocityRef = useRef(0);
  const marqueeDirectionRef = useRef<MarqueeDirection>(-1);
  const marqueeRafRef = useRef<number | null>(null);
  const inertiaRafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  const [activeLogicalIndex, setActiveLogicalIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [flowDirection, setFlowDirection] = useState<MarqueeFlow>("right");
  const [carouselInView, setCarouselInView] = useState(false);
  const videosEnabled = carouselInView && !reduceMotion;

  const slideCount = PROCESS_SLIDES.length;

  const loopSlides = useMemo(
    () =>
      Array.from({ length: LOOP_SETS * slideCount }, (_, index) => {
        const slide = PROCESS_SLIDES[index % slideCount];
        return { slide, physicalIndex: index, logicalIndex: index % slideCount };
      }),
    [slideCount],
  );

  const applyMarqueeDirection = useCallback((direction: MarqueeDirection) => {
    marqueeDirectionRef.current = direction;
    setFlowDirection(directionToFlow(direction));
  }, []);

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

  const isSlideActive = useCallback((physicalIndex: number) => {
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
  }, []);

  const findBestPhysicalIndex = useCallback(
    (logicalIndex: number) => {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!track || !viewport) return logicalIndex;

      const targetCenter = viewport.offsetWidth / 2;
      let bestPhysical = logicalIndex;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let i = logicalIndex; i < track.children.length; i += slideCount) {
        const el = track.children[i] as HTMLElement;
        const childCenter =
          el.offsetLeft - positionRef.current + el.offsetWidth / 2;
        const distance = Math.abs(childCenter - targetCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPhysical = i;
        }
      }

      return bestPhysical;
    },
    [slideCount],
  );

  const scrollToPhysical = useCallback(
    (physicalIndex: number) => {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!track || !viewport) return;

      const el = track.children[physicalIndex] as HTMLElement | undefined;
      if (!el) return;

      positionRef.current =
        el.offsetLeft + el.offsetWidth / 2 - viewport.offsetWidth / 2;
      normalizePosition();
      applyTransform();
      syncActiveIndex();
    },
    [applyTransform, normalizePosition, syncActiveIndex],
  );

  const pauseMarqueeForDrag = useCallback(() => {
    setIsPaused(hoverPausedRef.current || true);
  }, []);

  const syncPausedUi = useCallback(() => {
    setIsPaused(
      hoverPausedRef.current ||
        draggingRef.current ||
        inertiaRafRef.current !== null,
    );
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRafRef.current !== null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }, []);

  const updateFlowFromGesture = useCallback(
    (pointerDeltaPx: number, velocityPxPerMs: number) => {
      const next = resolveMarqueeDirection(pointerDeltaPx, velocityPxPerMs);
      if (next !== null) {
        applyMarqueeDirection(next);
      }
    },
    [applyMarqueeDirection],
  );

  const startInertia = useCallback(
    (velocityPxPerMs: number, pointerDeltaPx: number) => {
      updateFlowFromGesture(pointerDeltaPx, velocityPxPerMs);

      stopInertia();
      let velocity = -velocityPxPerMs * 1000;
      if (Math.abs(velocity) < INERTIA_MIN_VELOCITY * 60) return;

      const step = () => {
        if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) {
          inertiaRafRef.current = null;
          syncPausedUi();
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
    [
      applyTransform,
      normalizePosition,
      stopInertia,
      syncActiveIndex,
      syncPausedUi,
      updateFlowFromGesture,
    ],
  );

  const nudgeBySlide = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current;
      if (!track) return;

      const activeEl = track.children[activeLogicalIndex] as
        | HTMLElement
        | undefined;
      const step = activeEl?.offsetWidth ?? 320;

      applyMarqueeDirection(direction === 1 ? 1 : -1);
      stopInertia();
      positionRef.current += direction * step * 0.92;
      normalizePosition();
      applyTransform();
      syncActiveIndex();
    },
    [
      activeLogicalIndex,
      applyMarqueeDirection,
      applyTransform,
      normalizePosition,
      stopInertia,
      syncActiveIndex,
    ],
  );

  const finishDrag = useCallback(
    (clientX: number, trackEl: HTMLDivElement | null) => {
      if (!draggingRef.current) return;

      draggingRef.current = false;
      setIsDragging(false);
      trackEl?.classList.remove("is-dragging");

      const pointerDelta = clientX - dragStartXRef.current;
      startInertia(dragVelocityRef.current, pointerDelta);
      syncPausedUi();
    },
    [startInertia, syncPausedUi],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      stopInertia();
      pauseMarqueeForDrag();
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
    [pauseMarqueeForDrag, stopInertia],
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

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      finishDrag(event.clientX, event.currentTarget);
    },
    [finishDrag],
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
        setCarouselInView(entry.isIntersecting);
      },
      { threshold: 0.08, rootMargin: "120px 0px" },
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
        draggingRef.current ||
        inertiaRafRef.current !== null;

      if (!paused && inViewRef.current && setWidthRef.current > 0) {
        const wave = 1 + Math.sin(timestamp * 0.0014) * 0.06;
        positionRef.current +=
          marqueeDirectionRef.current * MARQUEE_SPEED_PX_S * dt * wave;
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
  }, [applyTransform, normalizePosition, reduceMotion, syncActiveIndex]);

  useEffect(() => {
    return () => {
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
          flowDirection === "left"
            ? "about-process-carousel-viewport--flow-left"
            : "about-process-carousel-viewport--flow-right",
        ].join(" ")}
        aria-roledescription="carrusel"
        aria-label={t("aboutProcessLabel")}
        onMouseEnter={() => {
          hoverPausedRef.current = true;
          setIsPaused(true);
        }}
        onMouseLeave={() => {
          hoverPausedRef.current = false;
          syncPausedUi();
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
            finishDrag(lastMoveXRef.current, event.currentTarget);
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
                  <ProcessSlideMedia
                    slide={slide}
                    carouselVideosEnabled={videosEnabled}
                  />
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
              stopInertia();
              scrollToPhysical(findBestPhysicalIndex(index));
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
