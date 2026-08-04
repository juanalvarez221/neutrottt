"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { CONNECTION_SPRING } from "@/shared/lib/connectionMotion";

type ConnectionCtaProps = {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tone: "accent" | "ghost";
  icon?: ReactNode;
  iconSide?: "leading" | "trailing";
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

/**
 * Isolated interaction leaf. Feedback is physical (spring), owned entirely by
 * Motion — there is no GSAP inside this tree, so scene orchestration (GSAP) and
 * control feedback (spring) never touch the same element.
 */
export function ConnectionCta({
  label,
  onClick,
  tone,
  icon,
  iconSide = "trailing",
  disabled = false,
  className,
  ariaLabel,
}: ConnectionCtaProps) {
  const reduceMotion = useReducedMotion();

  const buttonVariants: Variants = {
    rest: { scale: 1, y: 0 },
    hover: { scale: 1.015, y: -1, transition: CONNECTION_SPRING.hover },
    press: { scale: 0.975, y: 0, transition: CONNECTION_SPRING.press },
  };

  const iconVariants: Variants = {
    rest: { x: 0 },
    hover: {
      x: iconSide === "leading" ? -3 : 3,
      transition: CONNECTION_SPRING.hover,
    },
    press: { x: 0, transition: CONNECTION_SPRING.press },
  };

  const toneClass =
    tone === "accent"
      ? "connection-cta--accent btn-accent"
      : "connection-cta--ghost btn-ghost-warm";

  const iconNode = icon ? (
    <motion.span
      className="connection-cta__icon"
      variants={reduceMotion ? undefined : iconVariants}
      aria-hidden
    >
      {icon}
    </motion.span>
  ) : null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={["connection-cta focus-ring", toneClass, className]
        .filter(Boolean)
        .join(" ")}
      initial="rest"
      animate="rest"
      whileHover={reduceMotion || disabled ? undefined : "hover"}
      whileFocus={reduceMotion || disabled ? undefined : "hover"}
      whileTap={reduceMotion || disabled ? undefined : "press"}
      variants={reduceMotion ? undefined : buttonVariants}
    >
      {iconSide === "leading" ? iconNode : null}
      <span className="connection-cta__label">{label}</span>
      {iconSide === "trailing" ? iconNode : null}
    </motion.button>
  );
}
