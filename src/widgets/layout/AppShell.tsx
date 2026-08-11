"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { NavBar } from "@/features/navigation/NavBar";
import { LanguageToggle } from "@/features/navigation/LanguageToggle";
import { cn } from "@/shared/lib/cn";

export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-7xl">
        <div className="w-full pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(5.75rem,calc(4.5rem+env(safe-area-inset-bottom)))] pt-5 sm:pt-6 lg:px-6 lg:pb-10 lg:pt-8">
          <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
            <button
              type="button"
              onClick={() => router.back()}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/15 hover:bg-white/8 active:scale-[0.98]"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Volver
            </button>
            <LanguageToggle />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
            className={cn(className)}
          >
            {children}
          </motion.div>
        </div>
      </div>

      <div className="lg:hidden">
        <NavBar />
      </div>
    </div>
  );
}
