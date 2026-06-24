"use client";

type DetailHotspotProps = {
  className: string;
  active: boolean;
  label: string;
  onClick?: () => void;
  showInactive?: boolean;
};

export function detailHotspotSurface(active: boolean, interactive: boolean): string {
  return [
    "absolute border transition-all duration-200",
    interactive ? "cursor-pointer" : "pointer-events-none",
    active
      ? "z-10 border-stone-400/75 bg-stone-500/36 shadow-[0_0_0_1px_rgba(232,226,218,0.45)_inset,0_0_22px_rgba(107,99,92,0.42)]"
      : "z-[1] border-stone-500/28 bg-stone-500/10 hover:border-stone-400/45 hover:bg-stone-500/16",
  ].join(" ");
}

export function DetailHotspot({
  className,
  active,
  label,
  onClick,
  showInactive = true,
}: DetailHotspotProps) {
  if (!active && !showInactive) return null;

  const surface = detailHotspotSurface(active, Boolean(onClick));

  const content = active ? (
    <span className="pointer-events-none absolute inset-x-1 bottom-1 z-20 rounded-md border border-stone-500/35 bg-stone-950/90 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-stone-100">
      {label}
    </span>
  ) : null;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={[surface, "body-map-hotspot", className].join(" ")}
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
