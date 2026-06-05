import Link from "next/link";
import { cn } from "@/shared/lib/cn";

type ButtonProps = {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "ghost";
  className?: string;
};

export function Button({
  children,
  href,
  variant = "primary",
  className,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold tracking-wide transition active:scale-[0.98] disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-amber-700 text-white hover:bg-amber-600 shadow-[0_10px_30px_-14px_rgba(245,158,11,0.7)]"
      : "bg-transparent text-zinc-200 hover:bg-white/5 border border-white/10";

  if (href) {
    return (
      <Link href={href} className={cn(base, styles, className)}>
        {children}
      </Link>
    );
  }

  return <button className={cn(base, styles, className)}>{children}</button>;
}

