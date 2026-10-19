import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
const url = process.env.QA_URL || "http://127.0.0.1:4173/",
  out = process.env.QA_OUT || "docs/water-v21";
await mkdir(out, { recursive: true });
const evidence = {
  url,
  at: new Date().toISOString(),
  checks: [],
  errors: [],
  warnings: [],
  states: [],
  shots: [],
  clearances: [],
};
function check(name, value = true) {
  assert.ok(value, name);
  evidence.checks.push(name);
  console.log("PASS " + name);
}
const browser = await chromium.launch({ channel: "chrome" });
const diag = (page) => page.evaluate(() => window.pelagicDiagnostics());
async function seek(page, p) {
  await page.locator("#progress").evaluate((el, p) => {
    el.value = String(p * 1000);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, p);
  await page.waitForTimeout(70);
}
async function shot(page, name) {
  const file = out + "/" + name + ".png";
  await page.screenshot({ path: file });
  evidence.shots.push(file);
  evidence.states.push({ name, ...(await diag(page)) });
}
try {
  for (const mobile of [false, true]) {
    const mode = mobile ? "mobile" : "desktop",
      ctx = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: mobile ? 2 : 1,
      }),
      page = await ctx.newPage();
    page.on("pageerror", (e) => evidence.errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") evidence.errors.push(m.text());
      if (m.type() === "warning") evidence.warnings.push(m.text());
    });
    await page.goto(url);
    await page.waitForFunction(() => window.pelagicDiagnostics?.().ready);
    check(
      mode + ": splash audio absent before gesture",
      (await diag(page)).audio === "not-created",
    );
    await shot(page, mode + "-opening");
    if (await page.evaluate(() => !!window.pelagicTest)) {
      for (const p of [0, 0.015, 0.03, 0.05, 0.075]) {
        await seek(page, p);
        const clearance = await page.evaluate(() =>
          window.pelagicTest.measureGroundClearance(),
        );
        evidence.clearances.push({ mode, p, clearance });
        check(
          mode + ": rendered ground clears camera at " + p,
          clearance > 1.7,
        );
      }
      if (!mobile) {
        await page.evaluate(async () => {
          await window.__THREE_GAME_TEST_HOOKS__.setState("coast");
          window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
        });
        await page.waitForTimeout(80);
        const on = await page.screenshot();
        await page.evaluate(
          () =>
            (window.pelagicTest.views.ocean.material.uniforms.reflectionAmount.value = 0),
        );
        await page.waitForTimeout(80);
        const off = await page.screenshot();
        const region = { left: 1070, top: 350, width: 290, height: 180 },
          a = await sharp(on).extract(region).removeAlpha().raw().toBuffer(),
          b = await sharp(off).extract(region).removeAlpha().raw().toBuffer();
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
        evidence.reflectionMeanDifference = sum / a.length;
        await sharp(on).toFile(out + "/reflection-on.png");
        await sharp(off).toFile(out + "/reflection-off.png");
        check(
          "island reflection changes actual water pixels",
          evidence.reflectionMeanDifference > 8,
        );
        await page.evaluate(() => {
          window.pelagicTest.views.ocean.material.uniforms.reflectionAmount.value = 1;
          window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);
        });
      }
    }
    await seek(page, 0.195);
    const before = (await diag(page)).crossing.entries;
    await page.locator("#play").click();
    await page.waitForFunction(
      (n) => window.pelagicDiagnostics().crossing.entries > n,
      before,
      { timeout: 12000 },
    );
    await shot(page, mode + "-entry-0");
    await page.waitForTimeout(220);
    await shot(page, mode + "-entry-1");
    await page.waitForTimeout(350);
    await shot(page, mode + "-entry-2");
    const entry = await diag(page);
    check(
      mode + ": entry emits pooled bubbles and water sheet",
      entry.crossing.lastDirection === "entry" &&
        entry.crossing.particles > 0 &&
        entry.wetLens > 0,
    );
    await page.waitForFunction(
      () => window.pelagicDiagnostics().submerged > 0.99,
    );
    await shot(page, mode + "-entry-submerged");
    const image = await page.screenshot(),
      meta = await sharp(image).metadata();
    const region = {
      left: Math.round(meta.width * 0.08),
      top: Math.round(meta.height * 0.1),
      width: Math.round(meta.width * 0.84),
      height: Math.round(meta.height * 0.16),
    };
    const pixels = await sharp(image)
      .extract(region)
      .removeAlpha()
      .raw()
      .toBuffer();
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 3)
      if (
        pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722 >
        150
      )
        bright++;
    const brightShare = bright / (pixels.length / 3);
    evidence.states.push({
      name: mode + "-entry-polygon-regression",
      brightShare,
    });
    check(
      mode + ": submerged entry has no bright polygon sheet",
      brightShare < 0.1,
    );
    check(
      mode + ": muted entry does not create audio",
      entry.audio === "not-created" && entry.splashSounds === 0,
    );
    await page.locator("#play").click();
    await seek(page, 0.65);
    await page.locator("#sound").click();
    const exitBefore = (await diag(page)).crossing.exits;
    await page.locator("#play").click();
    await page.waitForFunction(
      (n) => window.pelagicDiagnostics().crossing.exits > n,
      exitBefore,
      { timeout: 12000 },
    );
    await shot(page, mode + "-exit-0");
    await page.waitForTimeout(250);
    await shot(page, mode + "-exit-1");
    await page.waitForTimeout(650);
    await shot(page, mode + "-exit-drips");
    const exit = await diag(page);
    check(
      mode + ": exit has spray, wet lens and gesture-enabled splash sound",
      exit.crossing.lastDirection === "exit" &&
        exit.wetLens > 0.1 &&
        exit.splashSounds > 0,
    );
    await page.locator("#play").click();
    await page.locator("#sound").click();
    const paused = await diag(page);
    await page.waitForTimeout(1100);
    const idle = await diag(page);
    check(
      mode + ": idle waves cannot retrigger splash",
      idle.crossing.entries === paused.crossing.entries &&
        idle.crossing.exits === paused.crossing.exits,
    );
    const reverseBefore = idle.crossing.entries;
    await page.locator("#reverse").click();
    await page.waitForFunction(
      (n) => window.pelagicDiagnostics().crossing.entries > n,
      reverseBefore,
      { timeout: 12000 },
    );
    await shot(page, mode + "-reverse-entry");
    await page.locator("#play").click();
    check(
      mode + ": reverse journey triggers correct entry direction",
      (await diag(page)).crossing.lastDirection === "entry",
    );
    check(
      mode + ": burst uses bounded pool",
      (await diag(page)).crossing.particles <= (mobile ? 84 : 180),
    );
    await ctx.close();
  }
  check("no runtime or shader errors", evidence.errors.length === 0);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.error = String(error);
  throw error;
} finally {
  await writeFile(out + "/results.json", JSON.stringify(evidence, null, 2));
  await browser.close();
}
