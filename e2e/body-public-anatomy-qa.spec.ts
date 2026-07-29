import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join("artifacts", "body-public-region-atlas-v2");

async function openPublicAnatomyQa(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("danniel.language", "es");
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

    // Camera regression: start front via chest, then upper back must go BACK
    await selectTarget(page, "full_chest");
    await shot(page, "36-before-click-upper-back-front.png");
    await selectTarget(page, "upper_back");
    await shot(page, "37-after-click-upper-back-back.png");

    // From back selection, pectoral should reframe front
    await selectTarget(page, "full_back");
    await shot(page, "38-before-click-pectoral-back.png");
    await selectTarget(page, "right_chest");
    await shot(page, "39-after-click-pectoral-front.png");

    await expect(page.getByText(/preferredView/i)).toBeVisible();
  });

  test("responsive framing evidence", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPublicAnatomyQa(page);

    await selectTarget(page, "full_chest");
    await shot(page, "29-desktop-full-chest.png");
    await selectTarget(page, "full_back");
    await shot(page, "30-desktop-full-back.png");
    await selectTarget(page, "right_ribs");
    await shot(page, "31-desktop-ribs.png");

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(400);
    await selectTarget(page, "full_chest");
    await shot(page, "32-tablet-full-chest.png");
    await selectTarget(page, "full_back");
    await shot(page, "33-tablet-full-back.png");
    await selectTarget(page, "left_thigh_front");
    await shot(page, "33b-tablet-thigh.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await selectTarget(page, "full_chest");
    await shot(page, "34-mobile-full-chest.png");
    await selectTarget(page, "full_back");
    await shot(page, "35-mobile-full-back.png");
    await selectTarget(page, "left_thigh_front");
    await shot(page, "35b-mobile-thigh.png");
  });
});
