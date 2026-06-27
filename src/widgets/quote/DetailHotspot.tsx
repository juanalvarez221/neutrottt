"use client";

type DetailHotspotProps = {
  className: string;
  active: boolean;
  preview?: boolean;
  label: string;
  onClick?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  showInactive?: boolean;
};

export function detailHotspotSurface(active: boolean, interactive: boolean, preview = false): string {
  if (active) {
    return [
      "absolute z-20 border-2 transition-all duration-200",
      interactive ? "cursor-pointer" : "pointer-events-none",
      "border-stone-100/90 bg-stone-400/42 shadow-[0_0_0_2px_rgba(232,226,218,0.55)_inset,0_0_28px_rgba(180,160,140,0.55)]",
    ].join(" ");
  }

  if (preview) {
    return [
      "absolute z-[15] border transition-all duration-200",
      interactive ? "cursor-pointer" : "pointer-events-none",
      "border-amber-200/55 bg-amber-400/22 shadow-[0_0_0_1px_rgba(251,191,36,0.35)_inset,0_0_16px_rgba(251,191,36,0.28)]",
    ].join(" ");
  }

  return [
    "absolute border transition-all duration-200",
    interactive ? "cursor-pointer" : "pointer-events-none",
    "z-[1] border-stone-500/22 bg-stone-500/8 hover:border-stone-400/40 hover:bg-stone-500/14",
  ].join(" ");
}

export function DetailHotspot({
  className,
  active,
  preview = false,
  label,
  onClick,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  showInactive = true,
}: DetailHotspotProps) {
  if (!active && !preview && !showInactive) return null;

  const surface = detailHotspotSurface(active, Boolean(onClick), preview);
  const interactive = Boolean(onClick);

  const content = active || preview ? (
    <span
      className={[
        "pointer-events-none absolute inset-x-1 bottom-1 z-20 rounded-md border px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.08em]",
        active
          ? "border-stone-300/45 bg-stone-950/95 text-stone-50"
          : "border-amber-300/35 bg-stone-950/85 text-amber-100",
      ].join(" ")}
    >
      {label}
    </span>
  ) : null;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={label}
        aria-pressed={active}
        className={[surface, "body-map-hotspot touch-manipulation", className].join(" ")}
      >
        {content}
      </button>
    );
  }

  return (
    <div aria-hidden className={[surface, className].join(" ")}>
      {content}
    </div>
  );
}
