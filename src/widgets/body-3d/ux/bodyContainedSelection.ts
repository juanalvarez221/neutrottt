import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import { getSelectionDisplayLabel } from "@/widgets/body-3d/interaction/bodyInteractionLabels";
import {
  addSelectionTarget,
  removeSelectionTarget,
} from "@/widgets/body-3d/interaction/bodySelectionEngine";
import type { SelectionTargetId } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

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

/**
 * Reemplaza un target contenedor por otro (p. ej. manga → antebrazo).
 * 1. Quita el contenedor
 * 2. Añade el nuevo target
 * 3. Normaliza vía addSelectionTarget
 */
export function replaceContainingSelection(
  current: readonly SelectionTargetId[],
  containingTargetId: SelectionTargetId,
  nextTargetId: SelectionTargetId,
): SelectionTargetId[] {
  const without = removeSelectionTarget(current, containingTargetId);
  return addSelectionTarget(without, nextTargetId);
}
