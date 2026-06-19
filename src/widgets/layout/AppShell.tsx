"use client";

import { motion } from "framer-motion";
import { NavBar } from "@/features/navigation/NavBar";
import { SideNav } from "@/features/navigation/SideNav";
import { cn } from "@/shared/lib/cn";

export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-[1200px] gap-0 lg:gap-6">
        <SideNav />

        <div className="w-full pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(5.75rem,calc(4.5rem+env(safe-area-inset-bottom)))] pt-5 sm:pt-6 lg:px-6 lg:pb-10 lg:pt-10">
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

