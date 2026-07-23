import { describe, expect, it } from "vitest";
import type { QuoteDraft } from "@/shared/lib/quoteDraft";
import {
  buildBody3DDraftFields,
  formatBodyTargetsDisplay,
  formatQuoteLocationLabel,
  isBody3DLocationComplete,
  normalizeQuoteBodyTargets,
  readBodyTargetsFromDraft,
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

  it("keeps three conceptual targets as three", () => {
    const targets = [
      "right_full_sleeve",
      "left_ribs",
      "right_thigh_outer",
    ] as const;
    const fields = buildBody3DDraftFields(targets);
    expect(fields.selectedBodyTargets).toEqual([...targets]);
    expect(fields.selectedBodyTargets).toHaveLength(3);
    expect(fields.zone).toBe("otro");
    expect(fields.zoneOther).toContain("Manga completa derecha");
    expect(fields.zoneOther).toContain("Costillas izquierdas");
  });

  it("empty selection disables continue", () => {
    expect(isBody3DLocationComplete([])).toBe(false);
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

  it("form state receives conceptual targets via draft fields", () => {
    const fields = buildBody3DDraftFields(["full_back"]);
    expect(fields.selectedBodyTargets).toEqual(["full_back"]);
    expect(fields.selectedBodyTargets?.[0]).not.toMatch(/^right_/);
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

  it("formatQuoteLocationLabel prefers selectedBodyTargets over legacy zone", () => {
    const draft: QuoteDraft = {
      size: "mediano",
      zone: "pecho",
      selectedBodyTargets: ["right_full_sleeve"],
    };
    const label = formatQuoteLocationLabel(draft, t as never, {
      zone: "pecho",
    });
    expect(label).toBe("Manga completa derecha");
  });

  it("formatQuoteLocationLabel falls back to legacy when no 3d targets", () => {
    const draft: QuoteDraft = {
      size: "mediano",
      zone: "otro",
      zoneOther: "Costado personalizado",
    };
    const label = formatQuoteLocationLabel(draft, t as never);
    expect(label).toBe("Costado personalizado");
  });
});
