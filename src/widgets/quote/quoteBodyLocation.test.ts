import { describe, expect, it } from "vitest";
import type { QuoteDraft } from "@/shared/lib/quoteDraft";
import {
  BODY_TARGETS_QUERY_KEY,
  buildBody3DNavigationParams,
  buildLegacyQuoteLocationFromBodyTargets,
  draftHasLocation,
  formatBodyTargetsDisplay,
  formatQuoteLocationLabel,
  hasCanonicalBodyTargets,
  isBody3DLocationComplete,
  normalizeQuoteBodyTargets,
  parseBodyTargetsQuery,
  readBodyTargetsFromDraft,
  serializeBodyTargetsQuery,
} from "@/widgets/quote/quoteBodyLocation";

const t = (key: string) => key;

describe("quote body location integration", () => {
  it("normalizes redundant forearm inside full sleeve before persistence", () => {
    const next = normalizeQuoteBodyTargets([
      "right_forearm",
      "right_full_sleeve",
    ]);
    expect(next).toEqual(["right_full_sleeve"]);
  });

  it("keeps partial overlap without dropping either target", () => {
    // left_ribs and right_full_sleeve do not contain each other
    const next = normalizeQuoteBodyTargets([
      "left_ribs",
      "right_full_sleeve",
    ]);
    expect(next).toEqual(["left_ribs", "right_full_sleeve"]);
  });

  it("keeps three conceptual targets as three", () => {
    const targets = [
      "right_full_sleeve",
      "left_ribs",
      "right_thigh_outer",
    ] as const;
    const fields = buildLegacyQuoteLocationFromBodyTargets(targets);
    expect(fields.selectedBodyTargets).toEqual([...targets]);
    expect(fields.selectedBodyTargets).toHaveLength(3);
    expect(fields.zone).toBe("otro");
    expect(fields.zoneOther).toContain("Manga completa derecha");
  });

  it("empty selection disables continue and skips legacy garbage", () => {
    expect(isBody3DLocationComplete([])).toBe(false);
    const empty = buildLegacyQuoteLocationFromBodyTargets([]);
    expect(empty.selectedBodyTargets).toEqual([]);
    expect(empty.zone).toBeUndefined();
    expect(empty.zoneOther).toBeUndefined();
  });

  it("selection enables continue", () => {
    expect(isBody3DLocationComplete(["right_forearm_outer"])).toBe(true);
  });

  it("restores conceptual targets from draft", () => {
    const draft: QuoteDraft = {
      size: "mediano",
      selectedBodyTargets: ["right_full_sleeve", "left_ribs"],
      zone: "otro",
      zoneOther: "legacy labels",
    };
    expect(readBodyTargetsFromDraft(draft)).toEqual([
      "right_full_sleeve",
      "left_ribs",
    ]);
  });

  it("selectedBodyTargets takes precedence over legacy zone", () => {
    const draft: QuoteDraft = {
      size: "mediano",
      zone: "pecho",
      zoneOther: "ignored",
      selectedBodyTargets: ["right_full_sleeve"],
    };
    expect(hasCanonicalBodyTargets(draft)).toBe(true);
    expect(formatQuoteLocationLabel(draft, t as never, { zone: "pecho" })).toBe(
      "Manga completa derecha",
    );
  });

  it("formatQuoteLocationLabel falls back to legacy when no 3d targets", () => {
    const draft: QuoteDraft = {
      size: "mediano",
      zone: "otro",
      zoneOther: "Costado personalizado",
    };
    expect(hasCanonicalBodyTargets(draft)).toBe(false);
    expect(formatQuoteLocationLabel(draft, t as never)).toBe(
      "Costado personalizado",
    );
  });

  it("summary uses natural labels not technical ids", () => {
    const label = formatBodyTargetsDisplay([
      "right_full_sleeve",
      "left_ribs",
      "right_thigh_outer",
    ]);
    expect(label).toBe(
      "Manga completa derecha · Costillas izquierdas · Muslo derecho · Cara externa",
    );
    expect(label).not.toContain("right_full_sleeve");
  });

  it("navigation query uses conceptual IDs not long labels", () => {
    const params = buildBody3DNavigationParams("mediano", [
      "right_full_sleeve",
      "left_ribs",
    ]);
    expect(params.get("zone")).toBe("otro");
    expect(params.get("zoneOther")).toBeNull();
    expect(params.get(BODY_TARGETS_QUERY_KEY)).toBe(
      "right_full_sleeve,left_ribs",
    );
    expect(serializeBodyTargetsQuery(["right_full_sleeve"])).toBe(
      "right_full_sleeve",
    );
    expect(parseBodyTargetsQuery("right_full_sleeve,left_ribs")).toEqual([
      "right_full_sleeve",
      "left_ribs",
    ]);
  });

  it("draftHasLocation prefers selectedBodyTargets for normal and large routes", () => {
    expect(
      draftHasLocation({
        size: "mediano",
        selectedBodyTargets: ["full_back"],
      }),
    ).toBe(true);
    expect(
      draftHasLocation({
        size: "grande",
        selectedBodyTargets: ["right_full_sleeve"],
      }),
    ).toBe(true);
    expect(draftHasLocation({ size: "mediano", zone: "pecho" })).toBe(true);
    expect(draftHasLocation({ size: "mediano" })).toBe(false);
  });

  it("legacy adapter is the single place producing zone/zoneOther", () => {
    const fields = buildLegacyQuoteLocationFromBodyTargets(["full_back"]);
    expect(fields).toEqual({
      selectedBodyTargets: ["full_back"],
      zone: "otro",
      zoneOther: "Espalda completa",
    });
  });
});
