/**
 * Helpers puros de layout del selector 3D (tooltip + panel contextual).
 */

export type TooltipPlacement = {
  left: number;
  top: number;
  side: "right" | "left" | "above";
};

export type ContextualPanelSide = "left" | "right";

export type SelectorLayoutMode =
  | "desktop-wide"
  | "desktop-medium"
  | "tablet-sheet"
  | "mobile-sheet";

const TOOLTIP_WIDTH = 176;
const TOOLTIP_HEIGHT = 40;
const GAP = 14;
const EDGE = 12;

/**
 * Coloca el tooltip evitando tapar el punto activo y el viewport.
 * Preferencia: derecha del cursor → izquierda → arriba.
 */
export function placeHoverTooltip(
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
  tooltipWidth = TOOLTIP_WIDTH,
  tooltipHeight = TOOLTIP_HEIGHT,
): TooltipPlacement {
  const rightLeft = pointerX + GAP;
  const fitsRight = rightLeft + tooltipWidth <= viewportWidth - EDGE;
  if (fitsRight) {
    return {
      left: rightLeft,
      top: clamp(
        pointerY - tooltipHeight / 2,
        EDGE,
        viewportHeight - tooltipHeight - EDGE,
      ),
      side: "right",
    };
  }

  const leftLeft = pointerX - GAP - tooltipWidth;
  const fitsLeft = leftLeft >= EDGE;
  if (fitsLeft) {
    return {
      left: leftLeft,
      top: clamp(
        pointerY - tooltipHeight / 2,
        EDGE,
        viewportHeight - tooltipHeight - EDGE,
      ),
      side: "left",
    };
  }

  return {
    left: clamp(pointerX - tooltipWidth / 2, EDGE, viewportWidth - tooltipWidth - EDGE),
    top: clamp(pointerY - GAP - tooltipHeight, EDGE, viewportHeight - tooltipHeight - EDGE),
    side: "above",
  };
}

/**
 * Si la zona activa está a la derecha del viewport, el panel va a la izquierda.
 */
export function resolveContextualPanelSide(
  focusX: number | null,
  viewportWidth: number,
): ContextualPanelSide {
  if (focusX == null || viewportWidth <= 0) return "right";
  return focusX > viewportWidth * 0.55 ? "left" : "right";
}

export function resolveSelectorLayoutMode(width: number): SelectorLayoutMode {
  if (width >= 1280) return "desktop-wide";
  if (width >= 900) return "desktop-medium";
  if (width >= 768) return "tablet-sheet";
  return "mobile-sheet";
}

/** Ancho máximo del panel flotante desktop (px). */
export function resolveDesktopPanelMaxWidth(
  mode: SelectorLayoutMode,
  viewportWidth: number,
): number {
  if (mode === "desktop-wide") return 320;
  if (mode === "desktop-medium") {
    return Math.min(300, Math.floor(viewportWidth * 0.32));
  }
  return 280;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
