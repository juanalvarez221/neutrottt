"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Eraser, Plus } from "lucide-react";
import { OptionCard } from "./OptionCard";
import { BreadcrumbNav, type BreadcrumbNode } from "./BreadcrumbNav";
import { SelectionSummary, type SummaryChip } from "./SelectionSummary";
import {
  buildSummaryLabel,
  getCurrentStepId,
  getOrderedSteps,
  getZone,
  isFlowComplete,
  sideOptions,
  ZONES,
  type FlowState,
  type Side,
  type ZoneSelection,
} from "./bodyZonesConfig";
import { cn } from "@/shared/lib/cn";

type Stage =
  | { kind: "zone" }
  | { kind: "side" }
  | { kind: "step"; stepId: string }
  | { kind: "complete" };

function resolveStage(state: FlowState): Stage {
  const zone = getZone(state.zoneId);
  if (!zone) return { kind: "zone" };
  if (zone.askSide && !state.side) return { kind: "side" };
  const currentStepId = getCurrentStepId(zone, state.answers);
  if (currentStepId) return { kind: "step", stepId: currentStepId };
  return { kind: "complete" };
}

function buildBreadcrumb(state: FlowState): BreadcrumbNode[] {
  const zone = getZone(state.zoneId);
  if (!zone) return [];
  const nodes: BreadcrumbNode[] = [{ target: { kind: "zone" }, label: zone.label }];

  if (zone.askSide && state.side) {
    const sideLabel = sideOptions(zone).find((s) => s.id === state.side)?.label ?? "";
    nodes.push({ target: { kind: "side" }, label: sideLabel });
  }

  const order = getOrderedSteps(zone, state.answers);
  for (const stepId of order) {
    const answer = state.answers.find((a) => a.stepId === stepId);
    if (!answer || answer.optionIds.length === 0) continue;
    const step = zone.steps[stepId];
    const labels = step.options.filter((o) => answer.optionIds.includes(o.id)).map((o) => o.label);
    if (labels.length > 0) {
      nodes.push({ target: { kind: "step", stepId }, label: labels.join(" + ") });
    }
  }

  return nodes;
}

const slide = {
  initial: { x: 40, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -40, opacity: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

export function ZoneRefinementPanel({
  state,
  committed,
  onSelectZone,
  onSelectSide,
  onToggleOption,
  onNavigate,
  onBack,
  onClearAll,
  onAddAnother,
  onConfirm,
  onRemoveChip,
}: {
  state: FlowState;
  committed: ZoneSelection[];
  onSelectZone: (zoneId: string) => void;
  onSelectSide: (side: Side) => void;
  onToggleOption: (stepId: string, optionId: string, multiple: boolean) => void;
  onNavigate: (target: BreadcrumbNode["target"]) => void;
  onBack: () => void;
  onClearAll: () => void;
  onAddAnother: () => void;
  onConfirm: () => void;
  onRemoveChip: (id: string) => void;
}) {
  const zone = getZone(state.zoneId);
  const stage = resolveStage(state);
  const breadcrumb = buildBreadcrumb(state);
  const hasDraft = Boolean(state.zoneId);
  const complete = isFlowComplete(state);
  const canGoBack = breadcrumb.length > 0 || stage.kind === "side";

  const chips: SummaryChip[] = committed.map((selection, index) => ({
    id: `committed-${index}`,
    label: selection.summaryLabel,
    removable: true,
  }));
  if (hasDraft) {
    chips.push({ id: "draft", label: buildSummaryLabel(state) || zone?.label || "", removable: true });
  }

  const stageKey =
    stage.kind === "step" ? `step-${stage.stepId}` : stage.kind === "side" ? "side" : stage.kind;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-[#5C4A32]/35 pb-3">
        <div className="min-w-0 flex-1">
          <BreadcrumbNav nodes={breadcrumb} onNavigate={onNavigate} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            aria-label="Atrás"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
              canGoBack
                ? "border-[#5C4A32]/50 text-[#A07840] hover:border-[#A07840]/70 hover:text-[#E8A84E]"
                : "border-[#5C4A32]/25 text-[#5C4A32]",
            )}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={!hasDraft && committed.length === 0}
            aria-label="Limpiar todo"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
              hasDraft || committed.length > 0
                ? "border-[#5C4A32]/50 text-[#A07840] hover:border-rose-400/50 hover:text-rose-300"
                : "border-[#5C4A32]/25 text-[#5C4A32]",
            )}
          >
            <Eraser className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">
        <AnimatePresence mode="wait">
          <motion.div key={stageKey} {...slide}>
            {stage.kind === "zone" ? (
              <StepBlock title="¿En qué parte del cuerpo?">
                <div className="grid grid-cols-2 gap-2.5">
                  {ZONES.map((z) => (
                    <OptionCard
                      key={z.id}
                      icon={z.icon}
                      label={z.label}
                      description={z.description}
                      selected={false}
                      onClick={() => onSelectZone(z.id)}
                    />
                  ))}
                </div>
              </StepBlock>
            ) : null}

            {stage.kind === "side" && zone ? (
              <StepBlock title={`¿Cuál ${zone.label.toLowerCase()}?`}>
                <div className="grid grid-cols-1 gap-2.5">
                  {sideOptions(zone).map((option) => (
                    <OptionCard
                      key={option.id}
                      icon={option.icon}
                      label={option.label}
                      selected={state.side === option.id}
                      wide
                      onClick={() => onSelectSide(option.id)}
                    />
                  ))}
                </div>
              </StepBlock>
            ) : null}

            {stage.kind === "step" && zone ? (
              (() => {
                const step = zone.steps[stage.stepId];
                const answer = state.answers.find((a) => a.stepId === stage.stepId);
                const selectedIds = answer?.optionIds ?? [];
                return (
                  <StepBlock
                    title={step.title}
                    hint={step.multiple ? "Puedes elegir varias opciones" : undefined}
                  >
                    <div className="grid grid-cols-2 gap-2.5">
                      {step.options.map((option) => (
                        <OptionCard
                          key={option.id}
                          icon={option.icon}
                          label={option.label}
                          description={option.description}
                          selected={selectedIds.includes(option.id)}
                          wide={option.wide}
                          onClick={() =>
                            onToggleOption(stage.stepId, option.id, Boolean(step.multiple))
                          }
                        />
                      ))}
                    </div>
                  </StepBlock>
                );
              })()
            ) : null}

            {stage.kind === "complete" && zone ? (
              <StepBlock title="Zona lista">
                <div className="rounded-2xl border border-[#A07840]/35 bg-[#C9893A]/10 p-4">
                  <div className="flex items-center gap-2 text-[#FBE7C6]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#C9893A] text-[#1C1410]">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span className="text-sm font-semibold">{buildSummaryLabel(state)}</span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
                    Puedes confirmar ahora o agregar otra zona del cuerpo al mismo diseño.
                  </p>
                  <button
                    type="button"
                    onClick={onAddAnother}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#5C4A32]/50 bg-[#1C1410]/60 px-3.5 py-2 text-[13px] font-semibold text-[#E8A84E] transition-colors hover:border-[#A07840]/70 active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Agregar otra zona
                  </button>
                </div>
              </StepBlock>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="space-y-3 border-t border-[#5C4A32]/35 pt-3">
        <SelectionSummary chips={chips} onRemove={onRemoveChip} />
        <ConfirmRow
          chips={chips}
          enabled={complete || committed.length > 0}
          onConfirm={onConfirm}
        />
      </footer>
    </div>
  );
}

function ConfirmRow({
  enabled,
  onConfirm,
  chips,
}: {
  enabled: boolean;
  onConfirm: () => void;
  chips: SummaryChip[];
}) {
  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={!enabled}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold tracking-wide transition-all duration-200",
        enabled
          ? "bg-[#C9893A] text-[#1C1410] hover:bg-[#E8A84E] active:translate-y-px active:scale-[0.99]"
          : "cursor-not-allowed bg-[#3D3020]/50 text-[#5C4A32]",
      )}
    >
      <Check className="h-4 w-4" strokeWidth={2.5} />
      Confirmar selección
      {chips.length > 0 ? (
        <span className="rounded-full bg-[#1C1410]/25 px-2 py-0.5 font-mono text-[12px]">{chips.length}</span>
      ) : null}
    </button>
  );
}

function StepBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3.5">
      <div className="space-y-1">
        <h3 className="text-[17px] font-semibold leading-tight text-zinc-50">{title}</h3>
        {hint ? (
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#A07840]">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
