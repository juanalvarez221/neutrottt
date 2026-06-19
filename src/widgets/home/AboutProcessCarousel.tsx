"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";
import { useHorizontalDragScroll } from "@/shared/hooks/useHorizontalDragScroll";

type ProcessSlide =
  | { type: "image"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey }
  | { type: "video"; src: string; altKey: SiteCopyKey; captionKey: SiteCopyKey };

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
    type: "image",
    src: "/brand/about-studio.png",
    altKey: "aboutImgStudioAlt",
    captionKey: "aboutProcessCaption2",
  },
];

const AUTO_ADVANCE_MS = 5200;
const RESUME_AUTO_MS = 7000;

function ProcessSlideMedia({
  slide,
  isActive,
}: {
  slide: ProcessSlide;
  isActive: boolean;
}) {
  const { t } = useSiteLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (slide.type !== "video") return;
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive, slide.type]);

  if (slide.type === "video") {
    return (
      <div className="about-process-media about-process-media--video">
        <video
          ref={videoRef}
          src={slide.src}
          className="about-process-video"
          muted
          loop
          playsInline
          preload="metadata"
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
  const activeIndexRef = useRef(0);
  const pausedRef = useRef(false);
  const inViewRef = useRef(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  useHorizontalDragScroll(scrollerRef);

  const syncActiveIndex = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.children.length === 0) return;

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

    activeIndexRef.current = closest;
    setActiveIndex(closest);
  }, []);

  const goToSlide = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const count = PROCESS_SLIDES.length;
      const target = ((index % count) + count) % count;
      const slideEl = scroller.children[target] as HTMLElement | undefined;
      if (!slideEl) return;

      slideEl.scrollIntoView({
        behavior: reduceMotion ? "auto" : behavior,
        inline: "center",
        block: "nearest",
      });

      activeIndexRef.current = target;
      setActiveIndex(target);
    },
    [reduceMotion],
  );

  const pauseAuto = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_AUTO_MS);
  }, []);

  const goNext = useCallback(() => {
    goToSlide(activeIndexRef.current + 1);
  }, [goToSlide]);

  const goPrev = useCallback(() => {
    goToSlide(activeIndexRef.current - 1);
  }, [goToSlide]);

  useEffect(() => {
    syncActiveIndex();
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const ro = new ResizeObserver(() => {
      goToSlide(activeIndexRef.current, "auto");
    });

    ro.observe(scroller);
    window.addEventListener("resize", syncActiveIndex);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncActiveIndex);
    };
  }, [goToSlide, syncActiveIndex]);

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

    const timer = window.setInterval(() => {
      if (pausedRef.current || !inViewRef.current) return;
      goToSlide(activeIndexRef.current + 1);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [goToSlide, reduceMotion]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
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
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
        onFocusCapture={pauseAuto}
        onTouchStart={pauseAuto}
      >
        <div className="about-process-carousel-fade about-process-carousel-fade--left" aria-hidden />
        <div className="about-process-carousel-fade about-process-carousel-fade--right" aria-hidden />

        <button
          type="button"
          className="about-process-carousel-nav about-process-carousel-nav--prev"
          onClick={() => {
            pauseAuto();
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
            pauseAuto();
            goNext();
          }}
          aria-label={t("famousGalleryNext")}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>

        <div
          ref={scrollerRef}
          className="about-process-carousel-track"
          onScroll={() => {
            pauseAuto();
            syncActiveIndex();
          }}
        >
          {PROCESS_SLIDES.map((slide, index) => (
            <figure
              key={`${slide.type}-${slide.src}`}
              className="about-process-slide about-process-frame"
              draggable={false}
            >
              <div className="about-process-frame__media">
                <ProcessSlideMedia slide={slide} isActive={index === activeIndex} />
              </div>
              <figcaption className="about-process-frame__caption">
                <p>{t(slide.captionKey)}</p>
              </figcaption>
            </figure>
          ))}
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
            aria-selected={index === activeIndex}
            aria-label={t("famousGallerySlide", { index: String(index + 1) })}
            onClick={() => {
              pauseAuto();
              goToSlide(index);
            }}
            className={[
              "about-process-carousel-dot focus-ring",
              index === activeIndex ? "about-process-carousel-dot--active" : "",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
