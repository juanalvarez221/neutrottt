"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AWARDS, type Award } from "@/shared/config/awards";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type AwardsRailCarouselProps = {
  onOpenAward: (award: Award, index: number) => void;
};

const LOOP = [...AWARDS, ...AWARDS, ...AWARDS];
const BASE_COUNT = AWARDS.length;
const AUTO_SPEED = 62;
const GAP = 14;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Smoothstep — soft ramp into the highlight peak */
function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Sharper center peak for “hero” feel */
function focusCurve(raw: number) {
  const eased = smoothstep(raw);
  return clamp01(Math.pow(eased, 0.82));
}

export function AwardsRailCarousel({ onOpenAward }: AwardsRailCarouselProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragStartX = useRef(0);
  const loopWidthRef = useRef(0);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const wheelResumeRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const measureLoop = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    const width = track.scrollWidth / 3;
    loopWidthRef.current = width;
    return width;
  }, []);

  const wrapX = useCallback((value: number) => {
    const loop = loopWidthRef.current;
    if (loop <= 0) return value;
    let next = value;
    while (next <= -loop * 2) next += loop;
    while (next > -loop) next -= loop;
    return next;
  }, []);

  const updateFocus = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return { slideIndex: 0, delta: 0 };

    const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    const falloff = Math.max(viewport.clientWidth * 0.48, 160);
    const slides = track.querySelectorAll<HTMLElement>("[data-award-slide]");

    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestDelta = 0;

    slides.forEach((slide, index) => {
      const rect = slide.getBoundingClientRect();
      const slideCenter = rect.left + rect.width / 2;
      const delta = slideCenter - center;
      const dist = Math.abs(delta);

      if (dist < bestDist) {
        bestDist = dist;
        best = index;
        bestDelta = delta;
      }

      const raw = 1 - Math.min(dist / falloff, 1);
      const focus = reduceMotion ? (dist < falloff * 0.22 ? 1 : 0.28) : focusCurve(raw);

      slide.style.setProperty("--focus", focus.toFixed(4));
      slide.style.zIndex = String(Math.round(1 + focus * 20));
      slide.dataset.active = focus > 0.9 ? "true" : "false";
      slide.dataset.peak = focus > 0.72 ? "true" : "false";
      if (focus > 0.9) {
        slide.setAttribute("aria-current", "true");
      } else {
        slide.removeAttribute("aria-current");
      }
    });

    return { slideIndex: best, delta: bestDelta };
  }, [reduceMotion]);

  const findNearestSlide = useCallback(() => {
    const result = updateFocus();
    return {
      slideIndex: result.slideIndex,
      logical: result.slideIndex % BASE_COUNT,
      delta: result.delta,
    };
  }, [updateFocus]);

  const snapToNearest = useCallback(() => {
    const nearest = findNearestSlide();
    if (Math.abs(nearest.delta) < 2) {
      x.set(wrapX(x.get()));
      updateFocus();
      return;
    }
    pausedRef.current = true;
    const target = wrapX(x.get() - nearest.delta);
    animate(x, target, {
      type: "spring",
      stiffness: 340,
      damping: 32,
      mass: 0.72,
      onUpdate: () => {
        updateFocus();
      },
      onComplete: () => {
        x.set(wrapX(x.get()));
        updateFocus();
        window.setTimeout(() => {
          pausedRef.current = false;
        }, 900);
      },
    });
  }, [findNearestSlide, updateFocus, wrapX, x]);

  useEffect(() => {
    measureLoop();
    const loop = loopWidthRef.current;
    if (loop > 0) x.set(-loop);
    updateFocus();

    const unsub = x.on("change", () => {
      updateFocus();
    });

    const onResize = () => {
      const previous = loopWidthRef.current;
      const next = measureLoop();
      if (previous > 0 && next > 0) {
        const ratio = next / previous;
        x.set(wrapX(x.get() * ratio));
      }
      updateFocus();
    };

    window.addEventListener("resize", onResize);
    return () => {
      unsub();
      window.removeEventListener("resize", onResize);
    };
  }, [measureLoop, updateFocus, wrapX, x]);

  useEffect(() => {
    if (reduceMotion) return;

    const tick = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      if (!pausedRef.current && !draggingRef.current && loopWidthRef.current > 0) {
        x.set(wrapX(x.get() - AUTO_SPEED * dt));
      } else {
        updateFocus();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = 0;
    };
  }, [reduceMotion, updateFocus, wrapX, x]);

  useEffect(() => {
    return () => {
      if (wheelResumeRef.current) window.clearTimeout(wheelResumeRef.current);
    };
  }, []);

  const nudge = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current;
      if (!track) return;
      const slide = track.querySelector<HTMLElement>("[data-award-slide]");
      const step = (slide?.offsetWidth ?? 160) + GAP;
      pausedRef.current = true;
      const target = wrapX(x.get() - direction * step);
      animate(x, target, {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.75,
        onUpdate: () => updateFocus(),
        onComplete: () => snapToNearest(),
      });
    },
    [snapToNearest, updateFocus, wrapX, x],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    draggingRef.current = true;
    movedRef.current = false;
    pausedRef.current = true;
    dragStartX.current = event.clientX - x.get();
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = event.clientX - dragStartX.current;
    if (Math.abs(next - x.get()) > 3) movedRef.current = true;
    x.set(wrapX(next));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    snapToNearest();
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX) && event.deltaX === 0) return;
    event.preventDefault();
    pausedRef.current = true;
    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    x.set(wrapX(x.get() - delta));
    if (wheelResumeRef.current) window.clearTimeout(wheelResumeRef.current);
    wheelResumeRef.current = window.setTimeout(() => {
      snapToNearest();
    }, 160);
  };

  const handleSlideActivate = (award: Award, index: number) => {
    if (movedRef.current) return;
    onOpenAward(award, index % BASE_COUNT);
  };

  return (
    <div className="awards-rail">
      <div
        ref={viewportRef}
        className={`awards-rail__viewport${isDragging ? " awards-rail__viewport--dragging" : ""}`}
        role="region"
        aria-label={t("trajectoryMarqueeAria")}
        aria-roledescription="carrusel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="awards-rail__fade awards-rail__fade--left" aria-hidden />
        <div className="awards-rail__fade awards-rail__fade--right" aria-hidden />

        <button
          type="button"
          className="awards-rail__nav awards-rail__nav--prev"
          aria-label={t("trajectoryMarqueePrev")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            nudge(-1);
          }}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="awards-rail__nav awards-rail__nav--next"
          aria-label={t("trajectoryMarqueeNext")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            nudge(1);
          }}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <motion.div ref={trackRef} className="awards-rail__track" style={{ x }}>
          {LOOP.map((award, index) => (
            <button
              key={`${award.id}-${index}`}
              type="button"
              data-award-slide
              data-active="false"
              data-peak="false"
              className="awards-rail__slide"
              style={{ ["--focus" as string]: 0 }}
              onClick={() => handleSlideActivate(award, index)}
              aria-label={award.title}
            >
              <span className="awards-rail__frame">
                <span className="awards-rail__glow" aria-hidden />
                <span className="awards-rail__media">
                  <Image
                    src={award.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 140px, 200px"
                    draggable={false}
                    className="awards-rail__image"
                  />
                  <span className="awards-rail__sheen" aria-hidden />
                </span>
              </span>
            </button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
