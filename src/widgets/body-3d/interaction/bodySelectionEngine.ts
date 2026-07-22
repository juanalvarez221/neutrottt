/**
 * Motor de selección puro (sin React).
 * Guarda selectedTargetIds conceptuales y resuelve atomic IDs para highlight.
 */

import { resolveTargetToAtomicZoneIds } from "@/widgets/body-3d/domain/bodySelectionTargets";
import type { SelectionTargetId } from "@/widgets/body-3d/interaction/bodyInteractionTypes";

function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function isSubset(inner: Set<string>, outer: Set<string>): boolean {
  if (inner.size === 0) return true;
  for (const v of inner) if (!outer.has(v)) return false;
  return true;
}

/**
 * Normaliza targets por containment de conjuntos atómicos.
 * - Si A ⊆ B y B se añade, elimina A.
 * - Si B ya está y se añade A ⊆ B, no añade A.
 * No elimina solapes parciales.
 */
export function normalizeSelectedTargetIds(
  targetIds: readonly SelectionTargetId[],
): SelectionTargetId[] {
  const unique: SelectionTargetId[] = [];
  for (const id of targetIds) {
    if (!unique.includes(id)) unique.push(id);
  }

  const sets = new Map<string, Set<string>>();
  for (const id of unique) {
    sets.set(id, new Set(resolveTargetToAtomicZoneIds(id)));
  }

  const kept: SelectionTargetId[] = [];
  for (const id of unique) {
    const setA = sets.get(id)!;
    let dominated = false;
    for (const other of unique) {
      if (other === id) continue;
      const setB = sets.get(other)!;
      // Identical sets: keep first occurrence only
      if (setEq(setA, setB) && unique.indexOf(other) < unique.indexOf(id)) {
        dominated = true;
        break;
      }
      // Strict subset of another selection → drop
      if (setA.size < setB.size && isSubset(setA, setB)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) kept.push(id);
  }
  return kept;
}

export function addSelectionTarget(
  current: readonly SelectionTargetId[],
  targetId: SelectionTargetId,
): SelectionTargetId[] {
  return normalizeSelectedTargetIds([...current, targetId]);
}

export function removeSelectionTarget(
  current: readonly SelectionTargetId[],
  targetId: SelectionTargetId,
): SelectionTargetId[] {
  return current.filter((id) => id !== targetId);
}

export function clearSelectionTargets(): SelectionTargetId[] {
  return [];
}

export function resolveSelectedAtomicZoneIds(
  selectedTargetIds: readonly SelectionTargetId[],
): readonly string[] {
  const out = new Set<string>();
  for (const id of selectedTargetIds) {
    for (const atomic of resolveTargetToAtomicZoneIds(id)) {
      out.add(atomic);
    }
  }
  return [...out].sort();
}

export function createEmptySelectionState() {
  return {
    hoveredAtomicZoneId: null as string | null,
    activeAtomicZoneId: null as string | null,
    selectedTargetIds: [] as SelectionTargetId[],
    resolvedSelectedAtomicZoneIds: [] as string[],
  };
}
