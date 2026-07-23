/**
 * API pública del selector 3D premium (integración futura).
 */

export { BodyPremiumSelector } from "@/widgets/body-3d/ux/BodyPremiumSelector";
export type { BodyPremiumSelectorProps } from "@/widgets/body-3d/ux/BodyPremiumSelector";
export { BODY_SELECTOR_DESKTOP_MIN_PX } from "@/widgets/body-3d/ux/BodyPremiumSelector";

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
