import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { Observer } from "gsap/Observer";

/**
 * Single source of truth for the Connection flow motion system.
 *
 * Every screen (Intro / Reward / Decline) shares the same GSAP engine, the same
 * authored brand easing curves and the same spring config, so the three acts
 * read as one short film. Plugins and CustomEases are registered exactly once.
 */

let registered = false;

/** Brand-authored narrative curves — never library defaults on hero moments. */
export const CONNECTION_EASE = {
  /** Hero reveals + trace draws: decisive rise, long soft tail. */
  hero: "neutrott",
  /** Veils, settles, exits: contained onset, serene arrival. */
  soft: "neutrott-soft",
  /** Micro accents / scramble landings. */
  snap: "neutrott-snap",
} as const;

/**
 * Hand-tuned spring configs for Motion (framer-motion) micro-interaction on the
 * isolated CTA leaf. Spring is used where feedback is physical, never for
 * narrative reveals (those stay on the GSAP `neutrott` curve).
 */
export const CONNECTION_SPRING = {
  press: { type: "spring", stiffness: 420, damping: 32, mass: 0.9 },
  hover: { type: "spring", stiffness: 300, damping: 26, mass: 0.8 },
  focus: { type: "spring", stiffness: 260, damping: 24, mass: 0.7 },
} as const;

/**
 * Shared pacing for Intro / Reward / Decline — snappy enough to feel premium,
 * long enough to read. One tempo for the whole connection film.
 */
export const CONNECTION_TIMING = {
  /** Playback multiplier applied to narrative timelines (1 = authored, >1 = faster). */
  playbackScale: 1.55,
  /** Quiet hold after intro titles land (seconds, pre-scale). */
  introReadHoldS: 1.05,
  /** Reward: earliest dismiss / CTA gate (ms). */
  rewardBaseReadMs: 1350,
  rewardBaseControlsMs: 850,
  rewardPerBlockMs: 200,
  /** Decline: earliest dismiss / CTA gate (ms). */
  declineDismissMs: 1600,
  declineControlsMs: 1000,
} as const;

/** Register GSAP Club plugins + author the brand easing curves once, client-side. */
export function registerConnectionMotion(): void {
  if (registered || typeof window === "undefined") return;

  gsap.registerPlugin(
    useGSAP,
    SplitText,
    CustomEase,
    DrawSVGPlugin,
    Flip,
    ScrambleTextPlugin,
    Observer,
  );

  CustomEase.create(CONNECTION_EASE.hero, "M0,0 C0.16,0.86 0.2,1 1,1");
  CustomEase.create(CONNECTION_EASE.soft, "M0,0 C0.4,0 0.16,1 1,1");
  CustomEase.create(CONNECTION_EASE.snap, "M0,0 C0.2,0.9 0.35,1 1,1");

  registered = true;
}

/**
 * Wait for fonts before any SplitText run so character/word geometry is measured
 * against the final Syncopate/Inter metrics (avoids reflow-on-reveal).
 */
export async function whenFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await document.fonts.ready;
  } catch {
    /* no-op: fall through to animate with whatever is loaded */
  }
}

export { gsap, SplitText, Flip, Observer };
