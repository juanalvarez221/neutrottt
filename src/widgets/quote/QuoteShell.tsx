"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { getFirstName } from "@/shared/lib/quoteProfile";

export function QuoteShell({
  children,
  brand = "MALIANTEO",
}: {
  children: React.ReactNode;
  brand?: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFirstName(getFirstName());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#26123f] via-[#08070d] to-black text-zinc-50">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 md:px-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="opacity-80 transition hover:opacity-100 active:scale-[0.98]"
            aria-label="Volver"
          >
            <ArrowLeft className="h-6 w-6 text-zinc-200" />
          </button>
          <h1 className="text-display text-base font-bold uppercase tracking-[0.18em] text-white drop-shadow-md">
            {brand}
          </h1>
          <button
            type="button"
            className="opacity-80 transition hover:opacity-100 active:scale-[0.98]"
            aria-label="Más"
          >
            <MoreVertical className="h-6 w-6 text-zinc-200" />
          </button>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full px-4 pb-28 pt-8 sm:px-6 md:px-10"
      >
        {firstName ? (
          <p className="typo-body mb-4 text-violet-200/95">
            Hola, {firstName}. Estoy aquí para guiarte paso a paso en tu
            cotización.
          </p>
        ) : null}
        {children}
      </motion.main>
    </div>
  );
}

