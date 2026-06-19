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
    "focus-ring inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold tracking-wide transition active:scale-[0.98] disabled:opacity-50";
  const styles =
    variant === "primary" ? "btn-accent" : "btn-ghost-warm";

  if (href) {
    return (
      <Link href={href} className={cn(base, styles, className)}>
        {children}
      </Link>
    );
  }

  return <button className={cn(base, styles, className)}>{children}</button>;
}
