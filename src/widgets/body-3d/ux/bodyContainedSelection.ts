import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";

export type ContainedSelectionInfo = {
  targetId: string;
  label: string;
};

/** Targets conceptuales que ya contienen la zona atómica tocada. */
export function findContainingSelections(
  atomicZoneId: string,
  selectedTargetIds: readonly string[],
): ContainedSelectionInfo[] {
  const out: ContainedSelectionInfo[] = [];
  for (const targetId of selectedTargetIds) {
    const atomics = resolveTargetToAtomicZoneIds(targetId);
    if (atomics.includes(atomicZoneId)) {
      out.push({
        targetId,
        label: getSelectionDisplayLabel(targetId),
      });
    }
  }
  return out;
}
