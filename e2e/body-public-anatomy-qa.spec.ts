import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join("artifacts", "body-public-region-atlas");

async function openPublicAnatomyQa(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("neutrottt.language", "es");
  });
  await page.goto("/lab/body-3d?mode=audit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Public Region Audit"),
    ) as HTMLButtonElement | undefined;
    tab?.click();
  });
  await expect(
    page.locator("text=Anatomical Region Review").first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("select").first()).toBeVisible({ timeout: 15_000 });
}

async function selectTarget(page: Page, targetId: string) {
  const select = page
    .locator("select")
    .filter({ has: page.locator(`option[value="${targetId}"]`) })
    .first();
  await select.selectOption(targetId);
  await page.waitForTimeout(1400);
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
    test.setTimeout(240_000);
    await openPublicAnatomyQa(page);

    // Camera regression: start front-ish via chest, then upper back must go BACK
    await selectTarget(page, "full_chest");
    await shot(page, "23-click-upper-back-from-front-before.png");
    await selectTarget(page, "upper_back_large");
    await shot(page, "24-click-upper-back-camera-result.png");
    await selectTarget(page, "full_back");
    await shot(page, "25-full-back-selected.png");
    await selectTarget(page, "full_chest");
    await shot(page, "26-click-chest-from-back-result.png");

    const shots: Array<[string, string]> = [
      ["right_chest", "playwright-pectoral-right.png"],
      ["full_chest", "playwright-full-chest.png"],
      ["full_abdomen", "playwright-abdomen.png"],
      ["full_back", "playwright-full-back.png"],
    ];
    for (const [id, file] of shots) {
      await selectTarget(page, id);
      await shot(page, file);
    }

    await expect(page.getByText(/preferredView/i)).toBeVisible();
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
    await selectTarget(page, "left_thigh_front");
    await shot(page, "tablet-820-thigh.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await selectTarget(page, "full_back");
    await shot(page, "mobile-390-full-back.png");
    await selectTarget(page, "full_chest");
    await shot(page, "mobile-390-full-chest.png");
  });
});
