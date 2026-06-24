"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { LazyVideo } from "@/shared/ui/LazyVideo";
import { useHorizontalDragScroll } from "@/shared/hooks/useHorizontalDragScroll";

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

const LOOP_SETS = 3;
const RESUME_AUTO_MS = 4200;
const IMAGE_AUTO_MS = 5800;
const VIDEO_AUTO_MS = 6800;
const SCROLL_SETTLE_MS = 120;
const PROGRAMMATIC_SCROLL_MS = 920;

function getScrollLeftForPhysical(scroller: HTMLElement, physicalIndex: number) {
  const slideEl = scroller.children[physicalIndex] as HTMLElement | undefined;
  if (!slideEl) return null;
  return slideEl.offsetLeft - (scroller.clientWidth - slideEl.offsetWidth) / 2;
}

function getAdvanceMs(logicalIndex: number) {
  return PROCESS_SLIDES[logicalIndex]?.type === "video"
    ? VIDEO_AUTO_MS
    : IMAGE_AUTO_MS;
}

function getSetWidth(scroller: HTMLElement, slideCount: number) {
  const first = scroller.children[0] as HTMLElement | undefined;
  const nextSet = scroller.children[slideCount] as HTMLElement | undefined;
  if (!first || !nextSet) return 0;
  return nextSet.offsetLeft - first.offsetLeft;
}

function getClosestPhysicalIndex(scroller: HTMLElement) {
  const center = scroller.scrollLeft + scroller.clientWidth / 2;
  let closest = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  Array.from(scroller.children).forEach((child, index) => {
    const el = child as HTMLElement;
    const childCenter = el.offsetLeft + el.offsetWidth / 2;
    const distance = Math.abs(center - childCenter);
    if (distance < minDistance) {
      minDistance = distance;
      closest = index;
    }
  });

  return closest;
}

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
        sizes="(max-width: 639px) 88vw, 420px"
        className="pointer-events-none object-contain object-center"
        draggable={false}
      />
    </div>
  );
}

export function AboutProcessCarousel() {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const logicalIndexRef = useRef(0);
  const physicalIndexRef = useRef(PROCESS_SLIDES.length);
  const hoverPausedRef = useRef(false);
  const interactionPausedRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const inViewRef = useRef(true);
  const loopJumpRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const [activeLogicalIndex, setActiveLogicalIndex] = useState(0);
  const [activePhysicalIndex, setActivePhysicalIndex] = useState(
    PROCESS_SLIDES.length,
  );

  const slideCount = PROCESS_SLIDES.length;

  const loopSlides = useMemo(
    () =>
      Array.from({ length: LOOP_SETS * slideCount }, (_, index) => {
        const slide = PROCESS_SLIDES[index % slideCount];
        return { slide, physicalIndex: index, logicalIndex: index % slideCount };
      }),
    [slideCount],
  );

  useHorizontalDragScroll(scrollerRef);

  const correctInfiniteLoop = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || loopJumpRef.current) return;

    const count = slideCount;
    const setWidth = getSetWidth(scroller, count);
    if (setWidth <= 0) return;

    const closest = getClosestPhysicalIndex(scroller);

    if (closest < count) {
      loopJumpRef.current = true;
      scroller.style.scrollBehavior = "auto";
      scroller.scrollLeft += setWidth;
      scroller.style.scrollBehavior = "";
      physicalIndexRef.current = closest + count;
      requestAnimationFrame(() => {
        loopJumpRef.current = false;
      });
    } else if (closest >= count * 2) {
      loopJumpRef.current = true;
      scroller.style.scrollBehavior = "auto";
      scroller.scrollLeft -= setWidth;
      scroller.style.scrollBehavior = "";
      physicalIndexRef.current = closest - count;
      requestAnimationFrame(() => {
        loopJumpRef.current = false;
      });
    }
  }, [slideCount]);

  const syncActiveIndex = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.children.length === 0) return;

    const closest = getClosestPhysicalIndex(scroller);
    const logical = ((closest % slideCount) + slideCount) % slideCount;

    physicalIndexRef.current = closest;
    logicalIndexRef.current = logical;
    setActivePhysicalIndex(closest);
    setActiveLogicalIndex(logical);
  }, [slideCount]);

  const scrollToPhysical = useCallback(
    (physicalIndex: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const slideEl = scroller.children[physicalIndex] as HTMLElement | undefined;
      if (!slideEl) return;

      const targetLeft = getScrollLeftForPhysical(scroller, physicalIndex);
      if (targetLeft === null) return;

      scroller.scrollTo({
        left: targetLeft,
        behavior: reduceMotion ? "auto" : behavior,
      });

      const logical = ((physicalIndex % slideCount) + slideCount) % slideCount;
      physicalIndexRef.current = physicalIndex;
      logicalIndexRef.current = logical;
      setActivePhysicalIndex(physicalIndex);
      setActiveLogicalIndex(logical);
    },
    [reduceMotion, slideCount],
  );

  const goToLogical = useCallback(
    (logicalIndex: number, behavior: ScrollBehavior = "smooth") => {
      const normalized =
        ((logicalIndex % slideCount) + slideCount) % slideCount;
      scrollToPhysical(slideCount + normalized, behavior);
    },
    [scrollToPhysical, slideCount],
  );

  const goNext = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollToPhysical(physicalIndexRef.current + 1, behavior);
    },
    [scrollToPhysical],
  );

  const goPrev = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollToPhysical(physicalIndexRef.current - 1, behavior);
    },
    [scrollToPhysical],
  );

  const pauseFromInteraction = useCallback(() => {
    interactionPausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      interactionPausedRef.current = false;
    }, RESUME_AUTO_MS);
  }, []);

  const markProgrammaticScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    scroller?.classList.add("is-auto-advancing");
    isProgrammaticScrollRef.current = true;
    if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    programmaticTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      scroller?.classList.remove("is-auto-advancing");
    }, PROGRAMMATIC_SCROLL_MS);
  }, []);

  const handleScroll = useCallback(() => {
    if (loopJumpRef.current) return;

    if (!isProgrammaticScrollRef.current) {
      pauseFromInteraction();
    }

    syncActiveIndex();

    if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    scrollSettleRef.current = setTimeout(() => {
      correctInfiniteLoop();
      syncActiveIndex();
    }, SCROLL_SETTLE_MS);
  }, [correctInfiniteLoop, pauseFromInteraction, syncActiveIndex]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || initializedRef.current) return;

    const middleStart = scroller.children[slideCount] as HTMLElement | undefined;
    if (!middleStart) return;

    const targetLeft = getScrollLeftForPhysical(scroller, slideCount);
    scroller.style.scrollBehavior = "auto";
    if (targetLeft !== null) scroller.scrollLeft = targetLeft;
    scroller.style.scrollBehavior = "";
    initializedRef.current = true;
    syncActiveIndex();
  }, [slideCount, syncActiveIndex]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const ro = new ResizeObserver(() => {
      goToLogical(logicalIndexRef.current, "auto");
    });

    ro.observe(scroller);
    return () => ro.disconnect();
  }, [goToLogical]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.35 },
    );

    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const schedule = () => {
      if (cancelled) return;
      const delay = getAdvanceMs(logicalIndexRef.current);
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (
          inViewRef.current &&
          !hoverPausedRef.current &&
          !interactionPausedRef.current
        ) {
          markProgrammaticScroll();
          goNext();
        }
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [goNext, markProgrammaticScroll, reduceMotion]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    };
  }, []);

  return (
    <div className="about-process-carousel mt-6 sm:mt-7">
      <div
        ref={viewportRef}
        className="about-process-carousel-viewport page-bleed-x relative"
        aria-roledescription="carrusel"
        aria-label={t("aboutProcessLabel")}
        onMouseEnter={() => {
          hoverPausedRef.current = true;
        }}
        onMouseLeave={() => {
          hoverPausedRef.current = false;
        }}
        onFocusCapture={pauseFromInteraction}
        onTouchStart={pauseFromInteraction}
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
          onClick={() => {
            pauseFromInteraction();
            goPrev();
          }}
          aria-label={t("famousGalleryPrev")}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>

        <button
          type="button"
          className="about-process-carousel-nav about-process-carousel-nav--next"
          onClick={() => {
            pauseFromInteraction();
            goNext();
          }}
          aria-label={t("famousGalleryNext")}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>

        <div
          ref={scrollerRef}
          className="about-process-carousel-track"
          onScroll={handleScroll}
        >
          {loopSlides.map(({ slide, physicalIndex }) => {
            const isActive = physicalIndex === activePhysicalIndex;

            return (
              <figure
                key={`${physicalIndex}-${slide.src}`}
                className={[
                  "about-process-slide about-process-frame",
                  isActive ? "about-process-slide--active" : "",
                ].join(" ")}
                draggable={false}
                aria-hidden={!isActive}
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
              pauseFromInteraction();
              goToLogical(index);
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
