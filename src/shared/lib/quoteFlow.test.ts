import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

vi.mock("@/shared/lib/safeStorage", () => ({
  safeLocalStorageGet: (key: string) => storage.get(key) ?? null,
  safeLocalStorageSet: (key: string, value: string) => {
    storage.set(key, value);
    return true;
  },
  safeLocalStorageRemove: (key: string) => {
    storage.delete(key);
    return true;
  },
}));

vi.mock("@/shared/lib/quoteProfile", () => ({
  getQuoteProfile: vi.fn(),
}));

vi.mock("@/shared/lib/quoteConnection", () => ({
  getQuoteConnection: vi.fn(),
  isRejectedCollaboration: vi.fn(),
}));

vi.mock("@/shared/lib/quoteDraft", () => ({
  clearQuoteDraft: vi.fn(() => {
    storage.delete("quote_draft");
  }),
  clearQuoteCompletionType: vi.fn(),
}));

import { getQuoteConnection, isRejectedCollaboration, type QuoteConnection } from "@/shared/lib/quoteConnection";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import {
  hasCompletedQuoteOnboarding,
  markQuoteOnboardingComplete,
  QUOTE_FLOW_PATHS,
  resolveOnboardingFallbackPath,
  resolveQuoteEntryPath,
  startNewQuoteSession,
} from "./quoteFlow";

const profile = {
  name: "Mateo Pérez",
  phone: "+57 300 123 4567",
  email: "mateo@ejemplo.com",
};

const approvedConnection: QuoteConnection = {
  referralSources: ["instagram"],
  personalValues: ["loyalty"],
  adjustments: ["trust_artist"],
  openNote: "",
};

describe("quoteFlow", () => {
  beforeEach(() => {
    storage.clear();
    vi.mocked(getQuoteProfile).mockReturnValue(null);
    vi.mocked(getQuoteConnection).mockReturnValue(null);
    vi.mocked(isRejectedCollaboration).mockReturnValue(false);
  });

  it("envía al perfil si no hay datos del usuario", () => {
    expect(resolveQuoteEntryPath()).toBe(QUOTE_FLOW_PATHS.profile);
    expect(resolveOnboardingFallbackPath()).toBe(QUOTE_FLOW_PATHS.profile);
  });

  it("envía a conexión si hay perfil pero onboarding incompleto", () => {
    vi.mocked(getQuoteProfile).mockReturnValue(profile);
    expect(resolveQuoteEntryPath()).toBe(QUOTE_FLOW_PATHS.connection);
    expect(resolveOnboardingFallbackPath()).toBe(QUOTE_FLOW_PATHS.connection);
  });

  it("salta al tatuaje si perfil y conexión aprobada están guardados", () => {
    vi.mocked(getQuoteProfile).mockReturnValue(profile);
    vi.mocked(getQuoteConnection).mockReturnValue(approvedConnection);
    expect(resolveQuoteEntryPath()).toBe(QUOTE_FLOW_PATHS.quoteStart);
    expect(resolveOnboardingFallbackPath()).toBeNull();
    expect(hasCompletedQuoteOnboarding()).toBe(true);
    expect(storage.get("quote_onboarding_complete")).toBe("1");
  });

  it("respeta el flag de onboarding con perfil guardado", () => {
    vi.mocked(getQuoteProfile).mockReturnValue(profile);
    markQuoteOnboardingComplete();
    expect(hasCompletedQuoteOnboarding()).toBe(true);
    expect(resolveQuoteEntryPath()).toBe(QUOTE_FLOW_PATHS.quoteStart);
  });

  it("startNewQuoteSession solo limpia el borrador de pieza", () => {
    storage.set("quote_draft", JSON.stringify({ size: "mediano" }));
    storage.set("quote_onboarding_complete", "1");
    startNewQuoteSession();
    expect(storage.has("quote_draft")).toBe(false);
    expect(storage.get("quote_onboarding_complete")).toBe("1");
  });
});
