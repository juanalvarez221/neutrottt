export const QUOTE_BACKGROUND_VIDEOS = [
  "/danniel/quote-bg/fondo-banner-1.mp4",
  "/danniel/quote-bg/fondo-banner-2.mp4",
  "/danniel/quote-bg/fondo-banner-3.mp4",
] as const;

/** @deprecated use QUOTE_BACKGROUND_VIDEOS */
export const QUOTE_BACKGROUND_VIDEO = QUOTE_BACKGROUND_VIDEOS[0];

/** Hold each clip before crossfade (ms). */
export const QUOTE_BG_HOLD_MS = 9000;

/** Crossfade duration (ms). */
export const QUOTE_BG_CROSSFADE_MS = 1600;
