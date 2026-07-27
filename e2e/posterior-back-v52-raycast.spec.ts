import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  openLabBack,
  raycastWorld,
  raycastWorldExpect,
  selectPublicTarget,
  writeJson,
} from "./posterior-back-v52-helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

type Probe = {
  id: string;
  xyz: [number, number, number];
  expect: string;
  inside?: boolean;
  d?: number;
};

type ExteriorProbe = {
  id: string;
  xyz: [number, number, number];
  expect?: string;
};

/** Sacrum/glute seam landmarks are too thin for screen-raycast authority. */
const BOUNDARY_PROBE_IDS = new Set(["zona_superior_sacro"]);

test("V5.2 raycast interiors and exteriors", async ({ page }) => {
  await openLabBack(page);
  const src = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "artifacts/posterior-back-v51/hit-alignment/analytical-probes.json",
      ),
      "utf8",
    ),
  ) as {
    upper: Probe[];
    lower: Probe[];
    exteriors?: ExteriorProbe[];
    exterior?: ExteriorProbe[];
  };

  const lowerInterior = src.lower.filter((p) => !BOUNDARY_PROBE_IDS.has(p.id));
  const exteriors = src.exteriors ?? src.exterior ?? [];

  const results: Record<string, unknown> = {
    upper: [],
    lower: [],
    full: [],
    exterior: [],
  };

  await selectPublicTarget(page, "upper_back");
  for (const p of src.upper) {
    const hit = await raycastWorldExpect(page, p.xyz, "upper_back");
    (results.upper as unknown[]).push({ ...p, hit });
    expect(hit?.publicTargetId ?? null, p.id).toBe("upper_back");
  }

  await selectPublicTarget(page, "lower_back");
  for (const p of lowerInterior) {
    const hit = await raycastWorldExpect(page, p.xyz, "lower_back");
    (results.lower as unknown[]).push({ ...p, hit });
    expect(hit?.publicTargetId ?? null, p.id).toBe("lower_back");
  }

  await selectPublicTarget(page, "full_back");
  for (const p of [...src.upper, ...lowerInterior]) {
    const hit = await raycastWorldExpect(page, p.xyz, "full_back");
    (results.full as unknown[]).push({ ...p, hit });
    expect(hit?.publicTargetId ?? null, p.id).toBe("full_back");
  }

  for (const p of exteriors) {
    const hit = await raycastWorld(page, p.xyz);
    (results.exterior as unknown[]).push({ ...p, hit });
    const id = hit?.publicTargetId ?? null;
    expect(["upper_back", "lower_back", "full_back"], p.id).not.toContain(id);
  }

  writeJson("hit-alignment/raycast-results.json", results);
});

test("V5.2 multiregion field hashes", async ({ page }) => {
  await openLabBack(page);
  const { readTiming } = await import("./posterior-back-v52-helpers");
  const expected: Record<string, string> = {
    upper_back: "6795862f576d5f8b",
    lower_back: "105365e5be961e96",
    full_back: "6da0b6bfe2eb5b38",
    right_ribs: "69a61207dd331a1d",
  };
  for (const [regionId, fieldHash] of Object.entries(expected)) {
    await selectPublicTarget(page, regionId);
    const timing = await readTiming(page);
    expect(timing?.status).toBe("ok");
    expect(timing?.fieldHash).toBe(fieldHash);
  }
});
