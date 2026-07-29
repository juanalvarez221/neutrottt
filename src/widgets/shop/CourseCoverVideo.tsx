"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

type CourseCoverVideoProps = {
  title: string;
  coverSrc: string;
  videoSrc: string;
};

const SLIDE_THRESHOLD = 72;

export function CourseCoverVideo({ title, coverSrc, videoSrc }: CourseCoverVideoProps) {
  const { t } = useSiteLanguage();
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [revealed, setRevealed] = useState(false);
  const y = useMotionValue(0);
  const coverOpacity = useTransform(y, [0, 160], [1, 0.25]);
  const hintOpacity = useTransform(y, [0, 36], [1, 0]);

  const playVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => undefined);
  }, []);

  const reveal = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
  }, [revealed]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const enough =
      Math.abs(info.offset.y) > SLIDE_THRESHOLD ||
      Math.abs(info.offset.x) > SLIDE_THRESHOLD ||
      Math.abs(info.velocity.y) > 650 ||
      Math.abs(info.velocity.x) > 650;

    if (enough) {
      reveal();
      return;
    }
    y.set(0);
  };

  return (
    <div className="relative aspect-[16/10] overflow-hidden border border-[rgba(var(--rgb-sand),0.14)] bg-[#0c0a08]">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        controls={revealed}
        playsInline
        preload="metadata"
        poster={coverSrc}
      >
        <source src={videoSrc} type="video/mp4" />
      </video>

      <AnimatePresence
        onExitComplete={() => {
          playVideo();
        }}
      >
        {!revealed ? (
          <motion.div
            key="course-cover"
            className="absolute inset-0 z-10 touch-pan-y"
            style={{ y, opacity: coverOpacity }}
            drag={reduceMotion ? false : true}
            dragConstraints={{ top: -280, bottom: 60, left: -160, right: 160 }}
            dragElastic={0.14}
            onDragEnd={handleDragEnd}
            initial={{ y: 0, opacity: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { y: -380, opacity: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } }
            }
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <div className="absolute inset-0 cursor-grab bg-[#0c0a08] active:cursor-grabbing">
              <Image
                src={coverSrc}
                alt={title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="pointer-events-none object-contain"
                draggable={false}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(8,6,7,0.9)] via-[rgba(8,6,7,0.4)] to-transparent px-4 pb-4 pt-20">
              <motion.div style={{ opacity: hintOpacity }} className="flex justify-center">
                <button
                  type="button"
                  onClick={reveal}
                  className="pointer-events-auto inline-flex h-11 items-center gap-2.5 rounded-full border border-[rgba(var(--rgb-sand),0.28)] bg-[rgba(18,12,14,0.78)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition active:scale-[0.98]"
                >
                  <span className="relative flex h-4 w-3 items-center justify-center" aria-hidden>
                    <motion.span
                      className="absolute h-1.5 w-1.5 rounded-full bg-[rgba(var(--rgb-sand),0.95)]"
                      animate={
                        reduceMotion
                          ? undefined
                          : { y: [3, -4, 3], opacity: [0.35, 1, 0.35] }
                      }
                      transition={{
                        duration: 1.25,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </span>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[rgba(var(--rgb-sand),0.9)]">
                    {reduceMotion ? t("courseCoverTapHint") : t("courseCoverSlideHint")}
                  </span>
                </button>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
