import { cn } from "@/shared/lib/cn";

export function AdminPageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] lg:items-end">
      <div className="min-w-0">
        {kicker ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-200/80">
            {kicker}
          </p>
        ) : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export function AdminSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-2xl border border-white/8 bg-white/5"
        />
      ))}
    </div>
  );
}

export function AdminEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="border-t border-white/10 px-1 py-10">
      <h2 className="text-base font-semibold text-zinc-50">{title}</h2>
      <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
      {message}
    </p>
  );
}

export function StatusPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        className,
      )}
    >
      {children}
    </span>
  );
}
