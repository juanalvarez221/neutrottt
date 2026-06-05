"use client";

import Image from "next/image";
import { motion, type MotionValue } from "framer-motion";

type HeroPortraitBannerProps = {
  src: string;
  alt: string;
  imageY?: MotionValue<number>;
  imageScale?: MotionValue<number>;
};

export function HeroPortraitBanner({
  src,
  alt,
  imageY,
  imageScale,
}: HeroPortraitBannerProps) {
  return (
    <div className="absolute inset-0">
      <motion.div
        className="absolute inset-0"
        style={{ y: imageY, scale: imageScale }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority
          quality={100}
          sizes="100vw"
          className="hero-photo-image"
        />
      </motion.div>

      <div className="hero-photo-grade absolute inset-0 z-[1]" aria-hidden />
      <div className="hero-photo-vignette absolute inset-0 z-[1]" aria-hidden />

      <div className="hero-photo-flashes absolute inset-0 z-[2] overflow-hidden" aria-hidden>
        <span className="hero-photo-flash hero-photo-flash--a" />
        <span className="hero-photo-flash hero-photo-flash--b" />
        <span className="hero-photo-flash hero-photo-flash--c" />
        <span className="hero-photo-shimmer" />
      </div>

      <div className="smoke absolute inset-0 z-[2] opacity-35" aria-hidden />
    </div>
  );
}
