/** Breakpoints alineados con Tailwind v4 y los media queries del proyecto. */
export const BREAKPOINTS = {
  xs: 380,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1400,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;
