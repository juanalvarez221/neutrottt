"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface BreadcrumbNode {
  /** Identifies where this node goes back to. */
  target: { kind: "zone" } | { kind: "side" } | { kind: "step"; stepId: string };
  label: string;
}

export function BreadcrumbNav({
  nodes,
  onNavigate,
}: {
  nodes: BreadcrumbNode[];
  onNavigate: (target: BreadcrumbNode["target"]) => void;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#A07840]/70">
        Elige una zona del cuerpo
      </p>
    );
  }

  return (
    <nav aria-label="Pasos de selección" className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        return (
          <Fragment key={`${node.label}-${index}`}>
            <button
              type="button"
              onClick={() => onNavigate(node.target)}
              disabled={isLast}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[12px] font-semibold tracking-wide transition-colors",
                isLast
                  ? "cursor-default text-[#FBE7C6]"
                  : "text-[#A07840] hover:bg-[#3D3020]/50 hover:text-[#E8A84E]",
              )}
            >
              {node.label}
            </button>
            {!isLast ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#5C4A32]" strokeWidth={2} /> : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
