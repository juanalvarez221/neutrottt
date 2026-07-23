/**
 * API pública del selector 3D premium (integración futura).
 */

export { BodyPremiumSelector } from "@/widgets/body-3d/ux/BodyPremiumSelector";
export type { BodyPremiumSelectorProps } from "@/widgets/body-3d/ux/BodyPremiumSelector";
export { BODY_SELECTOR_DESKTOP_MIN_PX } from "@/widgets/body-3d/ux/BodyPremiumSelector";
export {
  computeFitFramingFromBox,
  verticalFillForViewport,
} from "@/widgets/body-3d/ux/bodyFitFraming";
export type { FittedBodyFraming } from "@/widgets/body-3d/ux/bodyFitFraming";

export type {
  BodySelectionTargetId,
  ConceptualBodySelectionPayload,
  BodySelectionIntegrationSnapshot,
} from "@/widgets/body-3d/ux/bodySelectionSerialization";
export {
  serializeConceptualBodySelection,
  buildBodySelectionSnapshot,
  getConceptualSelectionCount,
} from "@/widgets/body-3d/ux/bodySelectionSerialization";

export {
  replaceContainingSelection,
  findContainingSelections,
} from "@/widgets/body-3d/ux/bodyContainedSelection";

export {
  getPreferredBodyView,
  getPreferredFocusSection,
  getFramingScale,
  getPublicCameraPoseMeta,
  getCameraPoseForPublicTarget,
  toCardinalCameraView,
  isPreferredViewAlreadyActive,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";
export type {
  PreferredBodyView,
  FramingScale,
} from "@/widgets/body-3d/ux/bodyPreferredCamera";
