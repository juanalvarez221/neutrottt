"use client";

import { useId } from "react";

type Tone = "warm" | "cool";

type ConnectionRuleProps = {
  /** Geometry variant — controls width/margin via CSS. */
  variant: "intro-title" | "intro-bridge" | "reward" | "decline";
  tone?: Tone;
};

/**
 * Hairline rule as a real SVG stroke so it can be revealed with DrawSVG
 * (trace draw) instead of a generic scaleX. Gradient id is unique per instance.
 */
export function ConnectionRule({ variant, tone = "warm" }: ConnectionRuleProps) {
  const rawId = useId().replace(/[:]/g, "");
  const gradientId = `connection-rule-${rawId}`;

  return (
    <svg
      className={`connection-rule connection-rule--${variant} connection-rule--${tone}`}
      viewBox="0 0 200 2"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop className="connection-rule__edge" offset="0" stopOpacity="0" />
          <stop className="connection-rule__mid-a" offset="0.2" />
          <stop className="connection-rule__mid" offset="0.5" />
          <stop className="connection-rule__mid-a" offset="0.8" />
          <stop className="connection-rule__edge" offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        className="connection-rule__line"
        x1="1"
        y1="1"
        x2="199"
        y2="1"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

type ConnectionCornersProps = {
  tone?: Tone;
};

/**
 * Editorial L-shaped corner marks as SVG paths so they can be drawn on with
 * DrawSVG. Positioned by CSS against the nearest `.connection-manifesto__stage`.
 */
export function ConnectionCorners({ tone = "warm" }: ConnectionCornersProps) {
  return (
    <>
      <svg
        className={`connection-corner connection-corner--tl connection-corner--${tone}`}
        viewBox="0 0 20 20"
        aria-hidden
        focusable="false"
      >
        <path
          className="connection-corner__path"
          d="M0.75 19.25 L0.75 0.75 L19.25 0.75"
          fill="none"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        className={`connection-corner connection-corner--br connection-corner--${tone}`}
        viewBox="0 0 20 20"
        aria-hidden
        focusable="false"
      >
        <path
          className="connection-corner__path"
          d="M19.25 0.75 L19.25 19.25 L0.75 19.25"
          fill="none"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}
