"use client";

import { useEffect, useRef, useState } from "react";
import {
  QUOTE_BACKGROUND_VIDEOS,
  QUOTE_BG_CROSSFADE_MS,
  QUOTE_BG_HOLD_MS,
} from "@/shared/config/quote";

type Layer = "a" | "b";

function nextIndex(current: number, total: number) {
  return (current + 1) % total;
}

function otherLayer(layer: Layer): Layer {
  return layer === "a" ? "b" : "a";
}

/**
 * Dual-layer ambient video mixer for the quote flow.
 * Crossfades FondoBanner clips without hard cuts.
 */
export function QuoteAmbientBackground() {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const activeLayerRef = useRef<Layer>("a");
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const fadingRef = useRef(false);
  const [activeLayer, setActiveLayer] = useState<Layer>("a");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const layerEl = (layer: Layer) => (layer === "a" ? videoARef.current : videoBRef.current);

    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleHold = () => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        void crossfadeToNext();
      }, QUOTE_BG_HOLD_MS);
    };

    const waitForCanPlay = (video: HTMLVideoElement) =>
      new Promise<void>((resolve, reject) => {
        if (video.readyState >= 3) {
          resolve();
          return;
        }
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("video load failed"));
        };
        const cleanup = () => {
          video.removeEventListener("canplay", onReady);
          video.removeEventListener("error", onError);
        };
        video.addEventListener("canplay", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
      });

    const crossfadeToNext = async () => {
      if (fadingRef.current) return;
      const from = activeLayerRef.current;
      const to = otherLayer(from);
      const fromVideo = layerEl(from);
      const toVideo = layerEl(to);
      if (!fromVideo || !toVideo) return;

      fadingRef.current = true;
      const upcoming = nextIndex(indexRef.current, QUOTE_BACKGROUND_VIDEOS.length);
      const nextSrc = QUOTE_BACKGROUND_VIDEOS[upcoming];

      try {
        toVideo.pause();
        toVideo.src = nextSrc;
        toVideo.load();
        await waitForCanPlay(toVideo);
        toVideo.currentTime = 0;
        await toVideo.play();
      } catch {
        fadingRef.current = false;
        scheduleHold();
        return;
      }

      activeLayerRef.current = to;
      indexRef.current = upcoming;
      setActiveLayer(to);

      window.setTimeout(() => {
        fromVideo.pause();
        fadingRef.current = false;
        scheduleHold();
      }, QUOTE_BG_CROSSFADE_MS + 50);
    };

    const boot = videoARef.current;
    if (boot) {
      boot.src = QUOTE_BACKGROUND_VIDEOS[0];
      boot.load();
      void boot.play().catch(() => undefined);
    }
    videoBRef.current?.pause();
    scheduleHold();

    return () => {
      clearTimer();
      videoARef.current?.pause();
      videoBRef.current?.pause();
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="quote-shell-video-fallback absolute inset-0" />
        <div className="absolute inset-0 quote-shell-overlay" />
      </div>
    );
  }

  const fadeClass = (layer: Layer) =>
    [
      "quote-shell-video absolute inset-0 h-full w-full object-cover transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)]",
      activeLayer === layer ? "opacity-100" : "opacity-0",
      activeLayer === layer ? "quote-shell-video--alive" : "",
    ].join(" ");

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#120c0e]" />
      <video
        ref={videoARef}
        className={fadeClass("a")}
        style={{ transitionDuration: `${QUOTE_BG_CROSSFADE_MS}ms` }}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
      />
      <video
        ref={videoBRef}
        className={fadeClass("b")}
        style={{ transitionDuration: `${QUOTE_BG_CROSSFADE_MS}ms` }}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
      />
      <div className="absolute inset-0 quote-shell-overlay" />
    </div>
  );
}
