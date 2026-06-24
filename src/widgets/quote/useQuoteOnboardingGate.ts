"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveOnboardingFallbackPath } from "@/shared/lib/quoteFlow";

/** Bloquea pasos del tatuaje hasta tener perfil + conexión guardados. */
export function useQuoteOnboardingGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fallback = resolveOnboardingFallbackPath();
    if (fallback) {
      router.replace(fallback);
      return;
    }
    setReady(true);
  }, [router]);

  return ready;
}
