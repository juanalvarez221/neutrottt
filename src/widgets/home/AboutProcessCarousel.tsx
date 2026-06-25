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
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import {
  ABOUT_PROCESS_SLIDES,
  type AboutProcessSlide,
} from "@/shared/config/aboutProcessSlides";
import { AboutProcessLightboxRoot } from "@/widgets/home/AboutProcessLightbox";
import {
  DIRECTION_VELOCITY_THRESHOLD,
  DRAG_LOCK_THRESHOLD_PX,
  DRAG_LOCK_THRESHOLD_TOUCH_PX,
  INERTIA_FRICTION,
  INERTIA_MIN_VELOCITY,
  INERTIA_VELOCITY_TOUCH_BOOST,
  MARQUEE_LOOP_SETS,
  MARQUEE_SPEED_PX_S,
  SNAP_EASE,
  SNAP_SCROLL_MS,
  VELOCITY_SAMPLE_WINDOW_MS,
  VERTICAL_SCROLL_THRESHOLD_PX,
  directionToFlow,
  resolveMarqueeDirection,
  type MarqueeDirection,
  type MarqueeFlow,
} from "@/widgets/home/aboutProcessCarouselMotion";

/** video → foto → video → foto — ver aboutProcessSlides.ts */
const PROCESS_SLIDES = ABOUT_PROCESS_SLIDES;

const LOOP_SETS = MARQUEE_LOOP_SETS;

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
  mediaLabel,
}: {
  slide: AboutProcessSlide;
  carouselVideosEnabled: boolean;
  mediaLabel: string;
}) {
  const { t } = useSiteLanguage();

  return (
    <div className="about-process-slide__hit" aria-hidden>
      {slide.type === "video" ? (
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
      ) : (
        <div className="about-process-media about-process-media--image">
          <Image
            src={slide.src}
            alt=""
            fill
            quality={92}
            sizes="(max-width: 639px) 72vw, 340px"
            className="pointer-events-none object-contain object-center"
            draggable={false}
          />
        </div>
      )}
      <span className="about-process-slide__open-hint">
        <Expand className="h-4 w-4" strokeWidth={1.75} />
        <span className="about-process-slide__open-label">{mediaLabel}</span>
      </span>
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
  const dragStartYRef = useRef(0);
  const dragStartPosRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const dragVelocityRef = useRef(0);
  const marqueeDirectionRef = useRef<MarqueeDirection>(-1);
  const marqueeRafRef = useRef<number | null>(null);
  const inertiaRafRef = useRef<number | null>(null);
  const scrollAnimRafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const tapTargetLogicalIndexRef = useRef<number | null>(null);
  const lightboxOpenRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const dragActivatedRef = useRef(false);
  const capturedPointerIdRef = useRef<number | null>(null);
  const pointerTypeRef = useRef<string>("mouse");
  const velocitySamplesRef = useRef<{ t: number; x: number }[]>([]);
  const inertiaLastTsRef = useRef(0);
  const wheelSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeLogicalIndex, setActiveLogicalIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [flowDirection, setFlowDirection] = useState<MarqueeFlow>("right");
  const [carouselInView, setCarouselInView] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const videosEnabled = carouselInView && !reduceMotion && lightboxIndex === null;

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

  const stopScrollAnim = useCallback(() => {
    if (scrollAnimRafRef.current !== null) {
      cancelAnimationFrame(scrollAnimRafRef.current);
      scrollAnimRafRef.current = null;
    }
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRafRef.current !== null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }, []);

  const animateScrollToPhysical = useCallback(
    (physicalIndex: number, onComplete?: () => void) => {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!track || !viewport) return;

      const el = track.children[physicalIndex] as HTMLElement | undefined;
      if (!el) return;

      const targetPos =
        el.offsetLeft + el.offsetWidth / 2 - viewport.offsetWidth / 2;
      const startPos = positionRef.current;
      const startTime = performance.now();

      stopScrollAnim();
      stopInertia();

      const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / SNAP_SCROLL_MS);
        const eased = SNAP_EASE(progress);
        positionRef.current = startPos + (targetPos - startPos) * eased;
        normalizePosition();
        applyTransform();
        syncActiveIndex();

        if (progress < 1) {
          scrollAnimRafRef.current = requestAnimationFrame(step);
          return;
        }

        scrollAnimRafRef.current = null;
        onComplete?.();
      };

      scrollAnimRafRef.current = requestAnimationFrame(step);
    },
    [applyTransform, normalizePosition, stopInertia, stopScrollAnim, syncActiveIndex],
  );

  const snapToNearestSlide = useCallback(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;

    const viewportCenter = viewport.offsetWidth / 2;
    let bestPhysical = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    Array.from(track.children).forEach((child, index) => {
      const el = child as HTMLElement;
      const childCenter =
        el.offsetLeft - positionRef.current + el.offsetWidth / 2;
      const distance = Math.abs(childCenter - viewportCenter);
      if (distance < minDistance) {
        minDistance = distance;
        bestPhysical = index;
      }
    });

    animateScrollToPhysical(bestPhysical);
  }, [animateScrollToPhysical]);

  const scrollToPhysical = useCallback(
    (physicalIndex: number) => {
      if (reduceMotion) {
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
        return;
      }
      animateScrollToPhysical(physicalIndex);
    },
    [
      animateScrollToPhysical,
      applyTransform,
      normalizePosition,
      reduceMotion,
      syncActiveIndex,
    ],
  );

  const pauseMarqueeForDrag = useCallback(() => {
    setIsPaused(hoverPausedRef.current || true);
  }, []);

  const syncPausedUi = useCallback(() => {
    setIsPaused(
      lightboxOpenRef.current ||
        hoverPausedRef.current ||
        draggingRef.current ||
        inertiaRafRef.current !== null ||
        scrollAnimRafRef.current !== null,
    );
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
      const touchBoost =
        pointerTypeRef.current === "touch" ? INERTIA_VELOCITY_TOUCH_BOOST : 1;
      let velocity = -velocityPxPerMs * 1000 * touchBoost;
      if (Math.abs(velocity) < INERTIA_MIN_VELOCITY * 50) {
        snapToNearestSlide();
        return;
      }

      inertiaLastTsRef.current = performance.now();

      const step = (now: number) => {
        const dt = Math.min(0.05, (now - inertiaLastTsRef.current) / 1000);
        inertiaLastTsRef.current = now;

        if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) {
          inertiaRafRef.current = null;
          syncPausedUi();
          snapToNearestSlide();
          return;
        }

        positionRef.current -= velocity * dt;
        velocity *= INERTIA_FRICTION ** (dt * 60);
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
      snapToNearestSlide,
      syncActiveIndex,
      syncPausedUi,
      updateFlowFromGesture,
    ],
  );

  const nudgeBySlide = useCallback(
    (direction: -1 | 1) => {
      applyMarqueeDirection(direction === 1 ? 1 : -1);
      stopInertia();
      stopScrollAnim();
      const nextLogical =
        (activeLogicalIndex + direction + slideCount) % slideCount;
      scrollToPhysical(findBestPhysicalIndex(nextLogical));
    },
    [
      activeLogicalIndex,
      applyMarqueeDirection,
      findBestPhysicalIndex,
      scrollToPhysical,
      slideCount,
      stopInertia,
      stopScrollAnim,
    ],
  );

  const getSmoothedVelocity = useCallback(() => {
    const samples = velocitySamplesRef.current;
    if (samples.length < 2) return dragVelocityRef.current;

    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return dragVelocityRef.current;
    return (last.x - first.x) / dt;
  }, []);

  const recordVelocitySample = useCallback((clientX: number) => {
    const now = performance.now();
    velocitySamplesRef.current.push({ t: now, x: clientX });
    velocitySamplesRef.current = velocitySamplesRef.current.filter(
      (sample) => now - sample.t <= VELOCITY_SAMPLE_WINDOW_MS,
    );
  }, []);

  const dragLockThreshold = useCallback(
    () =>
      pointerTypeRef.current === "touch"
        ? DRAG_LOCK_THRESHOLD_TOUCH_PX
        : DRAG_LOCK_THRESHOLD_PX,
    [],
  );

  const openLightbox = useCallback(
    (logicalIndex: number) => {
      lightboxOpenRef.current = true;
      stopInertia();
      stopScrollAnim();
      setLightboxIndex(logicalIndex);
      setIsPaused(true);
      scrollToPhysical(findBestPhysicalIndex(logicalIndex));
    },
    [findBestPhysicalIndex, scrollToPhysical, stopInertia, stopScrollAnim],
  );

  const closeLightbox = useCallback(() => {
    lightboxOpenRef.current = false;
    setLightboxIndex(null);
    syncPausedUi();
  }, [syncPausedUi]);

  const releasePointer = useCallback((trackEl: HTMLDivElement | null) => {
    if (capturedPointerIdRef.current !== null && trackEl) {
      try {
        trackEl.releasePointerCapture(capturedPointerIdRef.current);
      } catch {
        /* ignore */
      }
    }
    capturedPointerIdRef.current = null;
  }, []);

  const finishPointer = useCallback(
    (clientX: number, trackEl: HTMLDivElement | null) => {
      if (!pointerActiveRef.current) return;

      pointerActiveRef.current = false;
      setIsPressing(false);
      releasePointer(trackEl);

      const pointerDelta = clientX - dragStartXRef.current;

      if (!dragActivatedRef.current) {
        const logicalIndex = tapTargetLogicalIndexRef.current;
        tapTargetLogicalIndexRef.current = null;
        if (logicalIndex !== null && !Number.isNaN(logicalIndex)) {
          openLightbox(logicalIndex);
        }
        draggingRef.current = false;
        setIsDragging(false);
        syncPausedUi();
        return;
      }

      draggingRef.current = false;
      setIsDragging(false);
      dragActivatedRef.current = false;
      tapTargetLogicalIndexRef.current = null;

      const velocity = getSmoothedVelocity();
      velocitySamplesRef.current = [];
      if (Math.abs(velocity) < DIRECTION_VELOCITY_THRESHOLD) {
        snapToNearestSlide();
        syncPausedUi();
        return;
      }

      startInertia(velocity, pointerDelta);
      syncPausedUi();
    },
    [getSmoothedVelocity, openLightbox, releasePointer, snapToNearestSlide, startInertia, syncPausedUi],
  );

  const activateDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      dragActivatedRef.current = true;
      draggingRef.current = true;
      setIsDragging(true);
      pauseMarqueeForDrag();

      if (capturedPointerIdRef.current === null) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
          capturedPointerIdRef.current = event.pointerId;
        } catch {
          /* ignore */
        }
      }
    },
    [pauseMarqueeForDrag],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (lightboxOpenRef.current) return;
      if ((event.target as HTMLElement).closest(".about-process-carousel-nav")) return;

      const figure = (event.target as HTMLElement).closest("[data-process-logical]");
      const logicalRaw = figure?.getAttribute("data-process-logical");
      tapTargetLogicalIndexRef.current =
        logicalRaw !== null && logicalRaw !== undefined ? Number(logicalRaw) : null;

      pointerTypeRef.current = event.pointerType;
      velocitySamplesRef.current = [];

      stopInertia();
      stopScrollAnim();
      pointerActiveRef.current = true;
      dragActivatedRef.current = false;
      draggingRef.current = false;
      setIsPressing(true);
      setIsDragging(false);
      pauseMarqueeForDrag();

      dragStartXRef.current = event.clientX;
      dragStartYRef.current = event.clientY;
      dragStartPosRef.current = positionRef.current;
      lastMoveXRef.current = event.clientX;
      lastMoveTimeRef.current = performance.now();
      dragVelocityRef.current = 0;
      recordVelocitySample(event.clientX);

      if (event.pointerType === "touch") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
          capturedPointerIdRef.current = event.pointerId;
        } catch {
          /* ignore */
        }
      }
    },
    [pauseMarqueeForDrag, recordVelocitySample, stopInertia, stopScrollAnim],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerActiveRef.current) return;

      const deltaX = event.clientX - dragStartXRef.current;
      const deltaY = event.clientY - dragStartYRef.current;

      if (!dragActivatedRef.current) {
        if (
          Math.abs(deltaY) > VERTICAL_SCROLL_THRESHOLD_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.05
        ) {
          pointerActiveRef.current = false;
          setIsPressing(false);
          tapTargetLogicalIndexRef.current = null;
          releasePointer(event.currentTarget);
          syncPausedUi();
          return;
        }

        if (Math.abs(deltaX) < dragLockThreshold()) return;

        activateDrag(event);
      }

      positionRef.current = dragStartPosRef.current - deltaX;
      normalizePosition();
      applyTransform();

      const now = performance.now();
      const dt = now - lastMoveTimeRef.current;
      if (dt > 0) {
        dragVelocityRef.current = (event.clientX - lastMoveXRef.current) / dt;
      }
      lastMoveXRef.current = event.clientX;
      lastMoveTimeRef.current = now;
      recordVelocitySample(event.clientX);
      syncActiveIndex();
    },
    [
      activateDrag,
      applyTransform,
      dragLockThreshold,
      normalizePosition,
      recordVelocitySample,
      releasePointer,
      syncActiveIndex,
      syncPausedUi,
    ],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      finishPointer(event.clientX, event.currentTarget);
    },
    [finishPointer],
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
        lightboxOpenRef.current ||
        hoverPausedRef.current ||
        draggingRef.current ||
        inertiaRafRef.current !== null ||
        scrollAnimRafRef.current !== null;

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
      stopScrollAnim();
      if (wheelSnapTimerRef.current !== null) {
        clearTimeout(wheelSnapTimerRef.current);
      }
    };
  }, [stopInertia, stopScrollAnim]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (lightboxOpenRef.current) return;

      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      if (absX < 2 || absX < absY * 0.5) return;

      event.preventDefault();
      stopInertia();
      stopScrollAnim();
      hoverPausedRef.current = true;
      setIsPaused(true);

      updateFlowFromGesture(event.deltaX, event.deltaX * 0.018);
      positionRef.current += event.deltaX;
      normalizePosition();
      applyTransform();
      syncActiveIndex();

      if (wheelSnapTimerRef.current !== null) {
        clearTimeout(wheelSnapTimerRef.current);
      }
      wheelSnapTimerRef.current = setTimeout(() => {
        wheelSnapTimerRef.current = null;
        hoverPausedRef.current = false;
        snapToNearestSlide();
        syncPausedUi();
      }, 200);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      if (wheelSnapTimerRef.current !== null) {
        clearTimeout(wheelSnapTimerRef.current);
      }
    };
  }, [
    applyTransform,
    normalizePosition,
    snapToNearestSlide,
    stopInertia,
    stopScrollAnim,
    syncActiveIndex,
    syncPausedUi,
    updateFlowFromGesture,
  ]);

  return (
    <div className="about-process-carousel mt-6 sm:mt-7">
      <AboutProcessLightboxRoot
        index={lightboxIndex}
        onClose={closeLightbox}
        onChangeIndex={setLightboxIndex}
      />

      <div
        ref={viewportRef}
        className={[
          "about-process-carousel-viewport about-process-carousel-viewport--marquee page-bleed-x relative",
          isPaused ? "about-process-carousel-viewport--paused" : "",
          isDragging ? "about-process-carousel-viewport--dragging" : "",
          isPressing ? "about-process-carousel-viewport--pressing" : "",
          lightboxIndex !== null ? "about-process-carousel-viewport--lightbox" : "",
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={(event) => {
          finishPointer(lastMoveXRef.current, event.currentTarget);
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
        >
          {loopSlides.map(({ slide, physicalIndex, logicalIndex }) => {
            const isActive = isSlideActive(physicalIndex);

            return (
              <figure
                key={`${physicalIndex}-${slide.src}`}
                data-process-logical={logicalIndex}
                className={[
                  "about-process-slide about-process-frame",
                  isActive ? "about-process-slide--active" : "",
                ].join(" ")}
                draggable={false}
                role="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={`${t(slide.captionKey)} — ${t("aboutProcessOpenMoment")}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openLightbox(logicalIndex);
                  }
                }}
              >
                <div className="about-process-frame__media">
                  <ProcessSlideMedia
                    slide={slide}
                    carouselVideosEnabled={videosEnabled}
                    mediaLabel={t("aboutProcessOpenMoment")}
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

      <p className="about-process-carousel-hint page-section-pad mt-3 text-center">
        {t("aboutProcessCarouselHint")}
      </p>

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
              stopScrollAnim();
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
