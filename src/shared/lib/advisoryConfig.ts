import type { AdvisoryMode } from "@/shared/lib/advisoryTypes";

export const ADVISORY_DURATIONS: Record<AdvisoryMode, number> = {
  presencial: 30,
  virtual: 15,
};

export const ADVISORY_STUDIO_NAME = "Estudio Emerald";

export function getAdvisoryDurationMin(mode: AdvisoryMode): number {
  return ADVISORY_DURATIONS[mode];
}
