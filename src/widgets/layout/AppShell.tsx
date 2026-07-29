"use client";

import { SiteFooter } from "@/widgets/layout/SiteFooter";
import { cn } from "@/shared/lib/cn";

export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background pt-14 sm:pt-16">
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16 lg:pt-10">
        <div className={cn(className)}>{children}</div>
      </div>
      <SiteFooter />
    </div>
  );
}
