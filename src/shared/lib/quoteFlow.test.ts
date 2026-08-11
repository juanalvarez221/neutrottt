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
  getQuoteDraft: vi.fn(() => {
    const raw = storage.get("quote_draft");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { size?: string; zone?: string; selectedBodyTargets?: string[] };
    } catch {
      return null;
    }
  }),
  saveQuoteDraft: vi.fn((draft: { size: string }) => {
    storage.set("quote_draft", JSON.stringify(draft));
  }),
  isLargeQuoteSize: (size: string) => size.toLowerCase().includes("gran"),
}));

import { getQuoteConnection, isRejectedCollaboration, type QuoteConnection } from "@/shared/lib/quoteConnection";
import { getQuoteProfile } from "@/shared/lib/quoteProfile";
import {
  captureQuoteProgress,
  getQuoteResumePath,
  hasCompletedQuoteOnboarding,
  markQuoteOnboardingComplete,
  QUOTE_FLOW_PATHS,
  resolveOnboardingFallbackPath,
  resolveQuoteBackPath,
  resolveQuoteEntryPath,
  resolveQuoteResumePath,
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

function params(entries: Record<string, string>) {
  return {
    get(name: string) {
      return entries[name] ?? null;
    },
  };
}

describe("quoteFlow", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", { localStorage: {} });
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

  it("startNewQuoteSession limpia borrador y retoma", () => {
    storage.set("quote_draft", JSON.stringify({ size: "mediano" }));
    storage.set("quote_onboarding_complete", "1");
    storage.set("quote_resume_path", "/cotizacion/ubicacion?size=mediano");
    startNewQuoteSession();
    expect(storage.has("quote_draft")).toBe(false);
    expect(storage.has("quote_resume_path")).toBe(false);
    expect(storage.get("quote_onboarding_complete")).toBe("1");
  });

  it("resuelve el paso anterior del flujo de cotización", () => {
    expect(resolveQuoteBackPath("/cotizacion")).toBe("/");
    expect(resolveQuoteBackPath("/cotizacion/conexion")).toBe(QUOTE_FLOW_PATHS.profile);
    expect(resolveQuoteBackPath("/cotizacion/ubicacion", params({ size: "grande" }))).toBe(
      QUOTE_FLOW_PATHS.quoteStart,
    );
    expect(resolveQuoteBackPath("/cotizacion/confirmacion", params({ size: "mediano" }))).toBe(
      "/cotizacion/ubicacion?size=mediano",
    );
    expect(resolveQuoteBackPath("/cotizacion/asesoria", params({ size: "grande" }))).toBe(
      "/cotizacion/ubicacion?size=grande",
    );
    expect(
      resolveQuoteBackPath("/cotizacion/asesoria/agendar", params({ size: "grande", mode: "virtual" })),
    ).toBe("/cotizacion/asesoria?size=grande");
    expect(resolveQuoteBackPath("/cotizacion/gracias")).toBe("/");
  });

  it("desde tamaño vuelve a conexión o inicio según onboarding", () => {
    expect(resolveQuoteBackPath("/cotizacion/tamano")).toBe(QUOTE_FLOW_PATHS.connection);
    vi.mocked(getQuoteProfile).mockReturnValue(profile);
    markQuoteOnboardingComplete();
    expect(resolveQuoteBackPath("/cotizacion/tamano")).toBe("/");
  });

  it("guarda progreso y retoma el mismo paso", () => {
    vi.mocked(getQuoteProfile).mockReturnValue(profile);
    markQuoteOnboardingComplete();

    captureQuoteProgress("/cotizacion/ubicacion", "?size=grande");
    expect(getQuoteResumePath()).toBe("/cotizacion/ubicacion?size=grande");
    expect(storage.get("quote_draft")).toContain("grande");
    expect(resolveQuoteResumePath()).toBe("/cotizacion/ubicacion?size=grande");
  });

  it("infiere retoma desde borrador si no hay resume path", () => {
    vi.mocked(getQuoteProfile).mockReturnValue(profile);
    markQuoteOnboardingComplete();
    storage.set(
      "quote_draft",
      JSON.stringify({ size: "mediano", zone: "brazo", selectedBodyTargets: ["left_arm"] }),
    );
    expect(resolveQuoteResumePath()).toBe(
      "/cotizacion/confirmacion?size=mediano&zone=brazo",
    );
  });
});
