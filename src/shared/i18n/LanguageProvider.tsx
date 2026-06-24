"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  detectLanguage,
  LANGUAGE_STORAGE_KEY,
  SITE_COPY,
  type SiteCopyKey,
  type SiteLanguage,
} from "@/shared/i18n/siteLanguage";
import { safeLocalStorageSet, safeStorageGet } from "@/shared/lib/safeStorage";

type LanguageContextValue = {
  language: SiteLanguage;
  isReady: boolean;
  needsSelection: boolean;
  setLanguage: (lang: SiteLanguage) => void;
  t: (key: SiteCopyKey, vars?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

type LanguageState = {
  language: SiteLanguage;
  needsSelection: boolean;
  isReady: boolean;
};

function readLanguageState(): LanguageState {
  if (typeof window === "undefined") {
    return { language: "es", needsSelection: false, isReady: false };
  }

  const saved = safeStorageGet(window.localStorage, LANGUAGE_STORAGE_KEY);
  if (saved === "es" || saved === "en") {
    return { language: saved, needsSelection: false, isReady: true };
  }

  return { language: detectLanguage(), needsSelection: true, isReady: true };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [langState, setLangState] = useState<LanguageState>(readLanguageState);

  const setLanguage = useCallback((lang: SiteLanguage) => {
    setLangState({ language: lang, needsSelection: false, isReady: true });
    safeLocalStorageSet(LANGUAGE_STORAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: SiteCopyKey, vars?: Record<string, string>) => {
      const raw: string = SITE_COPY[langState.language][key];
      if (!vars) return raw;
      return Object.entries(vars).reduce(
        (acc, [varKey, varValue]) => acc.replaceAll(`{${varKey}}`, varValue),
        raw,
      );
    },
    [langState.language],
  );

  const value = useMemo(
    () => ({
      language: langState.language,
      isReady: langState.isReady,
      needsSelection: langState.needsSelection,
      setLanguage,
      t,
    }),
    [langState, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useSiteLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useSiteLanguage must be used inside LanguageProvider");
  }
  return context;
}
