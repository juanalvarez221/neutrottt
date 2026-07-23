/**
 * Helpers puros para modo controlado del selector premium.
 */

import type { BodySelectionTargetId } from "@/widgets/body-3d/ux/bodySelectionSerialization";

export type ControlledSelectionProps = {
  value?: readonly BodySelectionTargetId[];
  defaultValue?: readonly BodySelectionTargetId[];
  onChange?: (nextTargets: BodySelectionTargetId[]) => void;
};

/** Resuelve valor efectivo (controlled vs uncontrolled). */
export function resolveControlledTargets(
  value: readonly BodySelectionTargetId[] | undefined,
  internal: readonly BodySelectionTargetId[],
): BodySelectionTargetId[] {
  return value !== undefined ? [...value] : [...internal];
}

export function isControlledSelection(
  value: readonly BodySelectionTargetId[] | undefined,
): boolean {
  return value !== undefined;
}

/**
 * Emite onChange si existe; en modo no controlado actualiza estado interno.
 * Devuelve el next que el padre / interno debe adoptar.
 */
export function applySelectionChange(
  next: BodySelectionTargetId[],
  options: {
    controlled: boolean;
    onChange?: (nextTargets: BodySelectionTargetId[]) => void;
    setInternal: (next: BodySelectionTargetId[]) => void;
  },
): BodySelectionTargetId[] {
  options.onChange?.(next);
  if (!options.controlled) {
    options.setInternal(next);
  }
  return next;
}
