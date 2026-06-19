"use client";

import { useCallback, useMemo, useReducer } from "react";
import { BodyMapSVG } from "./BodyMapSVG";
import { ZoneRefinementPanel } from "./ZoneRefinementPanel";
import type { BreadcrumbNode } from "./BreadcrumbNav";
import {
  buildResult,
  buildSelection,
  computeActiveRegions,
  computePartialRegions,
  getOrderedSteps,
  getZone,
  type BodyZoneResult,
  type FlowState,
  type Side,
  type ZoneSelection,
} from "./bodyZonesConfig";
import { cn } from "@/shared/lib/cn";

const EMPTY_DRAFT: FlowState = { zoneId: null, side: null, answers: [] };

interface ReducerState {
  committed: ZoneSelection[];
  draft: FlowState;
}

type Action =
  | { type: "SELECT_ZONE"; zoneId: string }
  | { type: "SELECT_SIDE"; side: Side }
  | { type: "TOGGLE_OPTION"; stepId: string; optionId: string; multiple: boolean }
  | { type: "NAVIGATE"; target: BreadcrumbNode["target"] }
  | { type: "BACK" }
  | { type: "CLEAR_ALL" }
  | { type: "ADD_ANOTHER" }
  | { type: "REMOVE_CHIP"; id: string };

function setSingleOption(draft: FlowState, stepId: string, optionId: string): FlowState {
  const zone = getZone(draft.zoneId);
  if (!zone) return draft;
  const order = getOrderedSteps(zone, draft.answers);
  const idx = order.indexOf(stepId);
  const keepSteps = idx >= 0 ? order.slice(0, idx) : order;
  const answers = draft.answers.filter((a) => keepSteps.includes(a.stepId));
  answers.push({ stepId, optionIds: [optionId] });
  return { ...draft, answers };
}

function toggleMultiOption(draft: FlowState, stepId: string, optionId: string): FlowState {
  const existing = draft.answers.find((a) => a.stepId === stepId);
  let answers: FlowState["answers"];
  if (existing) {
    const has = existing.optionIds.includes(optionId);
    const optionIds = has
      ? existing.optionIds.filter((id) => id !== optionId)
      : [...existing.optionIds, optionId];
    answers = draft.answers
      .map((a) => (a.stepId === stepId ? { ...a, optionIds } : a))
      .filter((a) => a.optionIds.length > 0);
  } else {
    answers = [...draft.answers, { stepId, optionIds: [optionId] }];
  }
  return { ...draft, answers };
}

function navigate(draft: FlowState, target: BreadcrumbNode["target"]): FlowState {
  if (target.kind === "zone") return { ...EMPTY_DRAFT };
  if (target.kind === "side") return { ...draft, side: null, answers: [] };

  const zone = getZone(draft.zoneId);
  if (!zone) return draft;
  const order = getOrderedSteps(zone, draft.answers);
  const idx = order.indexOf(target.stepId);
  const keepSteps = idx >= 0 ? order.slice(0, idx) : order;
  return { ...draft, answers: draft.answers.filter((a) => keepSteps.includes(a.stepId)) };
}

function goBack(draft: FlowState): FlowState {
  const zone = getZone(draft.zoneId);
  if (!zone) return draft;
  const order = getOrderedSteps(zone, draft.answers);
  const answeredSteps = order.filter((stepId) =>
    draft.answers.some((a) => a.stepId === stepId && a.optionIds.length > 0),
  );
  if (answeredSteps.length > 0) {
    const last = answeredSteps[answeredSteps.length - 1];
    return { ...draft, answers: draft.answers.filter((a) => a.stepId !== last) };
  }
  if (zone.askSide && draft.side) return { ...draft, side: null };
  return { ...EMPTY_DRAFT };
}

function reducer(state: ReducerState, action: Action): ReducerState {
  switch (action.type) {
    case "SELECT_ZONE":
      return { ...state, draft: { zoneId: action.zoneId, side: null, answers: [] } };
    case "SELECT_SIDE":
      return { ...state, draft: { ...state.draft, side: action.side } };
    case "TOGGLE_OPTION":
      return {
        ...state,
        draft: action.multiple
          ? toggleMultiOption(state.draft, action.stepId, action.optionId)
          : setSingleOption(state.draft, action.stepId, action.optionId),
      };
    case "NAVIGATE":
      return { ...state, draft: navigate(state.draft, action.target) };
    case "BACK":
      return { ...state, draft: goBack(state.draft) };
    case "CLEAR_ALL":
      return { committed: [], draft: { ...EMPTY_DRAFT } };
    case "ADD_ANOTHER": {
      const selection = buildSelection(state.draft);
      if (!selection) return state;
      return { committed: [...state.committed, selection], draft: { ...EMPTY_DRAFT } };
    }
    case "REMOVE_CHIP": {
      if (action.id === "draft") return { ...state, draft: { ...EMPTY_DRAFT } };
      const match = /^committed-(\d+)$/.exec(action.id);
      if (match) {
        const index = Number(match[1]);
        return { ...state, committed: state.committed.filter((_, i) => i !== index) };
      }
      return state;
    }
    default:
      return state;
  }
}

export function BodyZoneSelector({
  onConfirm,
  className,
}: {
  onConfirm?: (result: BodyZoneResult) => void;
  className?: string;
}) {
  const [state, dispatch] = useReducer(reducer, { committed: [], draft: { ...EMPTY_DRAFT } });

  const { activeRegions, partialRegions, dimUnrelated } = useMemo(() => {
    const draftActive = computeActiveRegions(state.draft);
    const committedActive = state.committed.flatMap((s) => s.svgRegions);
    return {
      activeRegions: Array.from(new Set([...committedActive, ...draftActive])),
      partialRegions: computePartialRegions(state.draft, draftActive),
      dimUnrelated: Boolean(state.draft.zoneId),
    };
  }, [state.draft, state.committed]);

  const handleConfirm = useCallback(() => {
    onConfirm?.(buildResult(state.committed, state.draft));
  }, [onConfirm, state.committed, state.draft]);

  const handleRegionClick = useCallback((zoneId: string) => {
    dispatch({ type: "SELECT_ZONE", zoneId });
  }, []);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-3xl border border-[#5C4A32]/40 bg-[#1C1410] text-zinc-100",
        className,
      )}
    >
      <div className="flex flex-col lg:grid lg:grid-cols-[3fr_2fr]">
        <section className="sticky top-0 z-20 max-h-[45dvh] overflow-hidden border-b border-[#5C4A32]/30 bg-[#1C1410]/95 p-3 backdrop-blur-sm lg:static lg:max-h-none lg:self-start lg:border-b-0 lg:border-r lg:p-5">
          <div className="lg:sticky lg:top-5">
            <BodyMapSVG
              activeRegions={activeRegions}
              partialRegions={partialRegions}
              dimUnrelated={dimUnrelated}
              onRegionClick={handleRegionClick}
            />
          </div>
        </section>

        <section className="flex max-h-[55dvh] min-h-[460px] flex-col p-4 lg:max-h-[80dvh] lg:p-5">
          <ZoneRefinementPanel
            state={state.draft}
            committed={state.committed}
            onSelectZone={(zoneId) => dispatch({ type: "SELECT_ZONE", zoneId })}
            onSelectSide={(side) => dispatch({ type: "SELECT_SIDE", side })}
            onToggleOption={(stepId, optionId, multiple) =>
              dispatch({ type: "TOGGLE_OPTION", stepId, optionId, multiple })
            }
            onNavigate={(target) => dispatch({ type: "NAVIGATE", target })}
            onBack={() => dispatch({ type: "BACK" })}
            onClearAll={() => dispatch({ type: "CLEAR_ALL" })}
            onAddAnother={() => dispatch({ type: "ADD_ANOTHER" })}
            onConfirm={handleConfirm}
            onRemoveChip={(id) => dispatch({ type: "REMOVE_CHIP", id })}
          />
        </section>
      </div>
    </div>
  );
}

export type { BodyZoneResult, ZoneSelection };
export default BodyZoneSelector;
