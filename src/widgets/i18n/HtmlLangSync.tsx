"use client";

import { useEffect } from "react";
import { useSiteLanguage } from "@/shared/i18n/LanguageProvider";

export function HtmlLangSync() {
  const { language, isReady } = useSiteLanguage();

  useEffect(() => {
    if (!isReady) return;
    document.documentElement.lang = language;
  }, [isReady, language]);

  return null;
}
