export type DesignTargetType = "Cliente" | "Proyecto";

export type DesignHistoryKind =
  | "Foto base"
  | "Boceto iPad"
  | "Propuesta"
  | "Diseno final";

export type DesignHistoryEntry = {
  id: string;
  createdAt: string;
  targetType: DesignTargetType;
  targetId: string;
  targetLabel: string;
  kind: DesignHistoryKind;
  fileName: string;
  notes: string;
};

import { safeLocalStorageSet, safeStorageGet } from "@/shared/lib/safeStorage";

const DESIGN_HISTORY_KEY = "design_history_entries";

export function getDesignHistoryEntries(): DesignHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = safeStorageGet(window.localStorage, DESIGN_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DesignHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveDesignHistoryEntries(entries: DesignHistoryEntry[]): boolean {
  if (typeof window === "undefined") return false;
  return safeLocalStorageSet(DESIGN_HISTORY_KEY, JSON.stringify(entries));
}

export function addDesignHistoryEntries(entries: DesignHistoryEntry[]) {
  const current = getDesignHistoryEntries();
  saveDesignHistoryEntries([...entries, ...current]);
}
