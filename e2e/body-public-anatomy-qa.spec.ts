import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join("artifacts", "body-public-region-atlas");

async function openPublicAnatomyQa(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("neutrottt.language", "es");
  });
  await page.goto("/lab/body-3d?mode=audit", { waitUntil: "networkidle" });
  // Forzar modo audit por si la hidratación deja el tab premium.
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Public Region Audit"),
    ) as HTMLButtonElement | undefined;
    tab?.click();
  });
  await expect(page.getByText("Public Anatomy QA")).toBeVisible({
    timeout: 45_000,
  });
}

async function selectTarget(page: Page, targetId: string) {
  const select = page.locator("select").filter({ has: page.locator(`option[value="${targetId}"]`) }).first();
  await select.selectOption(targetId);
  // Allow camera animation
  await page.waitForTimeout(1200);
}

async function shot(page: Page, name: string) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await canvas.screenshot({
    path: path.join(OUT, name),
    animations: "disabled",
  });
}

test.describe("Public Anatomy browser QA", () => {
  test("canonical region screenshots + camera upper back", async ({ page }) => {
    test.setTimeout(180_000);
    await openPublicAnatomyQa(page);

    const shots: Array<[string, string]> = [
      ["right_chest", "pectoralis-right-front.png"],
      ["left_chest", "pectoralis-left-front.png"],
      ["full_chest", "full-chest-front.png"],
      ["full_abdomen", "abdomen-front.png"],
      ["right_ribs", "ribs-right-side.png"],
      ["left_ribs", "ribs-left-side.png"],
      ["upper_back_large", "upper-back-back.png"],
      ["lower_back_large", "lower-back-back.png"],
      ["full_back", "full-back-back.png"],
      ["right_biceps_region", "biceps-right.png"],
      ["right_triceps_region", "triceps-right.png"],
      ["left_lower_leg_front", "shin-left.png"],
      ["left_lower_leg_back", "calf-left.png"],
    ];

    for (const [id, file] of shots) {
      await selectTarget(page, id);
      await shot(page, file);
    }

    // Camera regression: upper back from audit select
    await selectTarget(page, "upper_back_large");
    await shot(page, "camera-upper-back-click.png");
    await selectTarget(page, "full_back");
    await shot(page, "camera-full-back-selected.png");

    // Preferred view metadata visible
    await expect(page.getByText(/preferredView/i)).toBeVisible();
    await expect(page.getByText(/back/i).first()).toBeVisible();
  });

  test("responsive framing evidence", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPublicAnatomyQa(page);

    await selectTarget(page, "full_back");
    await shot(page, "desktop-1440-full-back.png");
    await selectTarget(page, "full_chest");
    await shot(page, "desktop-1440-full-chest.png");

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(400);
    await selectTarget(page, "full_back");
    await shot(page, "tablet-820-full-back.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await selectTarget(page, "full_back");
    await shot(page, "mobile-390-full-back.png");
    await selectTarget(page, "full_chest");
    await shot(page, "mobile-390-full-chest.png");
  });
});
