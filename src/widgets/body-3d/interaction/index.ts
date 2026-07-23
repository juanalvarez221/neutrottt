export type { SelectionTarget, SelectionTargetKind, ContextualSelectionOption, BodyInteractionSelectionState, AtomicBodyZoneId, SelectionTargetId } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
export { CLICK_DRAG_THRESHOLD_PX } from "@/widgets/body-3d/interaction/bodyInteractionTypes";
export {
  getSelectionDisplayLabel,
  interactionMeshNameToAtomicId,
  atomicIdToInteractionMeshName,
} from "@/widgets/body-3d/interaction/bodyInteractionLabels";
export { getSelectionOptionsForAtomicZone } from "@/widgets/body-3d/interaction/bodyInteractionResolver";
export {
  addSelectionTarget,
  removeSelectionTarget,
  clearSelectionTargets,
  normalizeSelectedTargetIds,
  resolveSelectedAtomicZoneIds,
  createEmptySelectionState,
} from "@/widgets/body-3d/interaction/bodySelectionEngine";
export { BodyInteractionModel } from "@/widgets/body-3d/interaction/BodyInteractionModel";
export { BodyZoneHighlight } from "@/widgets/body-3d/interaction/BodyZoneHighlight";
export { BodyPublicRegionHighlight } from "@/widgets/body-3d/interaction/BodyPublicRegionHighlight";
export { BodyInteractionLabPanel } from "@/widgets/body-3d/interaction/BodyInteractionLabPanel";
export { getPublicSelectionOptionsForAtomicZone } from "@/widgets/body-3d/domain/bodyPublicSelectionRouting";
export {
  isPublicSelectableBodyTarget,
  PUBLIC_SELECTABLE_BODY_TARGET_IDS,
} from "@/widgets/body-3d/domain/bodyPublicSelectionTargets";
