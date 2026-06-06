"use client";

import { motion, type Transition } from "framer-motion";

const EASE_OUT_EXPO: Transition["ease"] = [0.22, 1, 0.36, 1];

export function StaggeredHeadline({
  text,
  className,
  delay = 0,
  stagger = 0.038,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <span className={className} aria-hidden>
      {text.split("").map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block will-change-transform [transform-style:preserve-3d]"
          initial={{ opacity: 0, y: "115%", rotateX: -72, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.62,
            delay: delay + index * stagger,
            ease: EASE_OUT_EXPO,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </span>
  );
}

export function CinematicBackdrop({ variant = "intro" }: { variant?: "intro" | "reward" }) {
  const intensity = variant === "reward" ? 0.34 : 0.22;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 95% 75% at 50% 42%, rgba(245,158,11,${intensity}), transparent 68%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(5,4,3,0.45),transparent)]" />
      <div className="connection-cinema__grain pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div className="connection-cinema__vignette pointer-events-none absolute inset-0" />

      {Array.from({ length: 6 }).map((_, index) => (
        <motion.span
          key={index}
          className="pointer-events-none absolute rounded-full bg-amber-300/20 blur-3xl"
          style={{
            width: 120 + index * 36,
            height: 120 + index * 36,
            left: `${12 + index * 14}%`,
            top: `${18 + (index % 3) * 22}%`,
          }}
          animate={{
            opacity: [0.15, 0.45, 0.15],
            scale: [0.9, 1.12, 0.9],
            x: [0, index % 2 === 0 ? 18 : -18, 0],
            y: [0, index % 2 === 0 ? -12 : 12, 0],
          }}
          transition={{
            duration: 4.2 + index * 0.35,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.25,
          }}
        />
      ))}
    </>
  );
}

export function FrameCorners({ delay = 0.4 }: { delay?: number }) {
  const corners = [
    "left-3 top-3 border-l border-t",
    "right-3 top-3 border-r border-t",
    "left-3 bottom-3 border-l border-b",
    "right-3 bottom-3 border-r border-b",
  ];

  return (
    <>
      {corners.map((position, index) => (
        <motion.span
          key={position}
          className={`pointer-events-none absolute h-8 w-8 border-amber-400/45 ${position}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: delay + index * 0.08, ease: EASE_OUT_EXPO }}
        />
      ))}
      <motion.span
        className="pointer-events-none absolute inset-4 rounded-2xl border border-amber-500/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.35] }}
        transition={{ duration: 1.2, delay: delay + 0.2, ease: EASE_OUT_EXPO }}
      />
    </>
  );
}

export function FloatingDust({ count = 22, originY = "42%" }: { count?: number; originY?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => {
        const angle = (index / count) * Math.PI * 2 + (index % 4) * 0.1;
        const distance = 64 + (index % 7) * 18;

        return (
          <motion.span
            key={index}
            className="pointer-events-none absolute left-1/2 rounded-full bg-gradient-to-br from-amber-100/90 to-orange-500/80 shadow-[0_0_10px_rgba(251,191,36,0.55)]"
            style={{
              top: originY,
              width: 2 + (index % 3),
              height: 2 + (index % 3),
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              opacity: [0, 0.95, 0],
              scale: [0, 1.15, 0.35],
            }}
            transition={{
              duration: 1.6 + (index % 5) * 0.15,
              delay: 0.35 + (index % 8) * 0.05,
              ease: EASE_OUT_EXPO,
              repeat: Infinity,
              repeatDelay: 0.9 + (index % 4) * 0.2,
            }}
          />
        );
      })}
    </>
  );
}

export function ShimmerPass({ delay = 1.1 }: { delay?: number }) {
  return (
    <motion.span
      className="connection-cinema__shimmer pointer-events-none absolute inset-0"
      initial={{ x: "-120%" }}
      animate={{ x: "120%" }}
      transition={{
        duration: 1.35,
        delay,
        ease: EASE_OUT_EXPO,
      }}
    />
  );
}

export function MonoEyebrow({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <motion.p
      className="typo-tech mb-5 text-[0.62rem] uppercase tracking-[0.34em] text-amber-200/70 md:text-[0.68rem]"
      initial={{ opacity: 0, letterSpacing: "0.5em" }}
      animate={{ opacity: 1, letterSpacing: "0.34em" }}
      transition={{ duration: 0.85, delay, ease: EASE_OUT_EXPO }}
    >
      {label}
    </motion.p>
  );
}
