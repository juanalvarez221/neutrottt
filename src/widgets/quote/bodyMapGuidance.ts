import type { ZoneId } from "@/shared/lib/quoteZones";
import type { SiteCopyKey } from "@/shared/i18n/siteLanguage";

export type BodyMapGuide = {
  titleKey: SiteCopyKey;
  hintKey: SiteCopyKey;
};

const ANATOMY_GUIDED_ZONES: Partial<Record<ZoneId, Partial<Record<"front" | "back", BodyMapGuide>>>> = {
  brazo: {
    front: {
      titleKey: "quoteBodyMapGuideArmTitle",
      hintKey: "quoteBodyMapGuideArmFrontHint",
    },
    back: {
      titleKey: "quoteBodyMapGuideArmTitle",
      hintKey: "quoteBodyMapGuideArmBackHint",
    },
  },
  cabeza: {
    front: {
      titleKey: "quoteBodyMapGuideHeadTitle",
      hintKey: "quoteBodyMapGuideHeadHint",
    },
    back: {
      titleKey: "quoteBodyMapGuideHeadTitle",
      hintKey: "quoteBodyMapGuideHeadHint",
    },
  },
  espalda: {
    front: {
      titleKey: "quoteBodyMapGuideBackTitle",
      hintKey: "quoteBodyMapGuideBackFrontHint",
    },
    back: {
      titleKey: "quoteBodyMapGuideBackTitle",
      hintKey: "quoteBodyMapGuideBackBackHint",
    },
  },
  pierna: {
    front: {
      titleKey: "quoteBodyMapGuideLegTitle",
      hintKey: "quoteBodyMapGuideLegFrontHint",
    },
    back: {
      titleKey: "quoteBodyMapGuideLegTitle",
      hintKey: "quoteBodyMapGuideLegBackHint",
    },
  },
};

export function getBodyMapGuideKeys(zone: ZoneId, side: "front" | "back"): BodyMapGuide {
  return (
    ANATOMY_GUIDED_ZONES[zone]?.[side] ?? {
      titleKey: "quoteBodyMapGuideSimpleTitle",
      hintKey: "quoteBodyMapGuideSimpleHint",
    }
  );
}
