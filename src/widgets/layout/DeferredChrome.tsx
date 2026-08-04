"use client";

import dynamic from "next/dynamic";

/** Chrome diferido: dock de cotización + prompt de idioma (sin SSR). */
const QuickActionDock = dynamic(
  () => import("@/widgets/navigation/QuickActionDock").then((mod) => mod.QuickActionDock),
  { ssr: false },
);

const LanguagePrompt = dynamic(
  () => import("@/widgets/i18n/LanguagePrompt").then((mod) => mod.LanguagePrompt),
  { ssr: false },
);

export function DeferredChrome() {
  return (
    <>
      <QuickActionDock />
      <LanguagePrompt />
    </>
  );
}
