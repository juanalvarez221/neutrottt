import { describe, expect, it } from "vitest";
import {
  formatReferralSummary,
  mapConnectionToSmartQuote,
  type QuoteConnection,
} from "./quoteConnection";

const t = (key: string) => key;

describe("quoteConnection / referral marketing", () => {
  it("formatea el canal de origen", () => {
    const connection: QuoteConnection = {
      source: "instagram",
      marketingOptIn: false,
      openNote: "",
    };
    expect(formatReferralSummary(connection, t)).toBe("quoteConnectionReferralInstagram");
  });

  it("incluye detalle cuando el origen es Otro", () => {
    const connection: QuoteConnection = {
      source: "other",
      sourceOther: "Feria local",
      marketingOptIn: true,
      openNote: "Quiero un tatuaje",
    };
    expect(formatReferralSummary(connection, t)).toBe(
      "quoteConnectionReferralOther: Feria local",
    );
  });

  it("mapea a SmartQuote con canal, marketing y nota (sin rechazo)", () => {
    const connection: QuoteConnection = {
      source: "tiktok",
      marketingOptIn: true,
      openNote: "Primera pieza",
    };
    expect(mapConnectionToSmartQuote(connection, t)).toEqual({
      connectionAftercare: "quoteConnectionReferralTiktok",
      connectionValues: "quoteConnectionMarketingYes",
      connectionCollaboration: undefined,
      connectionPurpose: "Primera pieza",
      marketingOptIn: true,
    });
  });
});
