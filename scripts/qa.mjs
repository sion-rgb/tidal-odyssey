import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.env.QA_URL || "http://127.0.0.1:5173/";
const out = process.env.QA_OUT || "docs/qa";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = {
  url,
  at: new Date().toISOString(),
  checks: [],
  screens: [],
  consoleErrors: [],
  warnings: [],
  failedRequests: [],
  viewports: [],
  tour: [],
  performance: [],
  motion: [],
};
function check(name, result = true) {
  assert.ok(result, name);
  evidence.checks.push(name);
  console.log(`PASS ${name}`);
}
async function makePage(options = {}) {
  const ctx = await browser.newContext(options),
    page = await ctx.newPage();
  page.on("pageerror", (error) => evidence.consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
    if (message.type() === "warning") evidence.warnings.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      evidence.failedRequests.push({
        url: response.url(),
        status: response.status(),
      });
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.pelagicDiagnostics?.().ready,
    {},
    { timeout: 30000 },
  );
  return { ctx, page };
}
const diag = (page) => page.evaluate(() => window.pelagicDiagnostics());
async function seek(page, p) {
  await page.locator("#progress").evaluate((el, p) => {
    el.value = String(p * 1000);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, p);
  await page.waitForFunction(
    (p) => Math.abs(window.pelagicDiagnostics().progress - p) < 0.002,
    p,
  );
  await page.waitForTimeout(120);
}
async function shot(page, name) {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path });
  evidence.screens.push(path);
}
try {
  const { page, ctx } = await makePage({
    viewport: { width: 1440, height: 900 },
  });
  check(
    "no logo in upper-left header",
    (await page.locator("header a,header .wordmark").count()) === 0,
  );
  check(
    "audio context absent before user action",
    (await diag(page)).audio === "not-created",
  );
  evidence.gpu = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2"),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  await page.waitForTimeout(2600);
  const graphics = await diag(page);
  check(
    "v2 PBR environment lighting loaded",
    graphics.graphicsVersion === "2.0" &&
      graphics.ibl &&
      graphics.textures >= 20,
  );
  check(
    "desktop shadows and planar reflection enabled",
    graphics.shadowResolution === 2048 &&
      graphics.reflectionResolution === 1024,
  );
  evidence.performance.push({ state: "coast", ...graphics });
  await shot(page, "desktop-coast");
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800);
  check("wheel moves camera forward", (await diag(page)).progress > 0.03);
  const afterWheel = (await diag(page)).progress;
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(800);
  check(
    "reverse wheel returns along same path",
    (await diag(page)).progress < afterWheel,
  );
  await page.locator("#sound").click();
  check(
    "audio starts only after button click",
    (await diag(page)).audio === "running",
  );
  await page.locator("#sound").click();
  await seek(page, 0.44);
  await page.waitForFunction(
    () =>
      window.pelagicDiagnostics().turtleLoaded &&
      window.pelagicDiagnostics().reefLoaded,
  );
  check("reef and deferred compressed turtle loaded");
  await page.waitForTimeout(2600);
  evidence.performance.push({ state: "reef", ...(await diag(page)) });
  await shot(page, "desktop-reef");
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1200);
    const path = `${out}/motion-turtle-${i}.png`;
    await page.screenshot({ path });
    evidence.motion.push({ path, time: Date.now(), state: await diag(page) });
  }
  await page.locator("#play").click();
  await page.waitForTimeout(600);
  await page.locator("#play").click();
  const pause = (await diag(page)).progress;
  await page.waitForTimeout(300);
  check(
    "pause freezes camera",
    Math.abs((await diag(page)).progress - pause) < 0.0001,
  );
  await page.locator("#reverse").click();
  await page.waitForTimeout(700);
  await page.locator("#play").click();
  check(
    "reverse automatic playback decreases progress",
    (await diag(page)).progress < pause,
  );
  await page.locator("#help").click();
  check("instructions dialog works", await page.locator("dialog").isVisible());
  await page.keyboard.press("Escape");
  await page.mouse.click(700, 150);
  const beforeKey = (await diag(page)).progress;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
  check("keyboard navigation works", (await diag(page)).progress > beforeKey);
  // Sample densely around each physical sea-level crossing without navigation.
  const crossing = [];
  for (const p of [
    0.19, 0.2, 0.21, 0.22, 0.23, 0.66, 0.67, 0.68, 0.69, 0.7, 0.71,
  ]) {
    await seek(page, p);
    crossing.push(await diag(page));
  }
  evidence.crossings = crossing;
  check(
    "first crossing moves from air to underwater",
    crossing[0].submerged < 0.2 && crossing[4].submerged > 0.9,
  );
  check(
    "second crossing moves from underwater to air",
    crossing[5].submerged > 0.9 && crossing.at(-1).submerged < 0.1,
  );
  check(
    "one document for all three scenes",
    await page.evaluate(
      () => performance.getEntriesByType("navigation").length === 1,
    ),
  );
  await page.locator("#quality").selectOption("low");
  check(
    "power-saving quality changes internal resolution",
    (await diag(page)).pixelRatio === 0.7,
  );
  await page.locator("#quality").selectOption("auto");
  const beforeResize = (await diag(page)).progress;
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(150);
  check(
    "resizing preserves journey and resizes canvas",
    await page.evaluate(
      (p) =>
        Math.abs(window.pelagicDiagnostics().progress - p) < 0.002 &&
        document.querySelector("canvas").getBoundingClientRect().width === 1024,
      beforeResize,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await seek(page, 1);
  await page.waitForTimeout(2600);
  evidence.performance.push({ state: "sky", ...(await diag(page)) });
  await shot(page, "desktop-sky");
  await seek(page, 0.86);
  await shot(page, "desktop-clouds");
  await seek(page, 0);
  // A full, unaccelerated automatic tour is optional for repeat runs.
  if (process.env.QA_QUICK !== "1") {
    await page.locator("#play").click();
    console.log("Starting full 100-second automatic tour");
    const start = Date.now();
    while (Date.now() - start < 115000) {
      await page.waitForTimeout(4500);
      const state = await diag(page);
      evidence.tour.push(state);
      console.log(
        JSON.stringify({
          tourProgress: Math.round(state.progress * 100),
          fps: Math.round(state.fps),
          height: Math.round(state.camera[1]),
        }),
      );
      if (!state.running && state.progress > 0.999) break;
    }
    check(
      "100-second automatic tour reaches high-altitude finish",
      (await diag(page)).progress > 0.999,
    );
    check(
      "automatic tour includes all three chapters",
      new Set(evidence.tour.map((s) => s.chapter)).size === 3,
    );
  }
  await ctx.close();
  for (const [width, height] of [
    [768, 1024],
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    const mobile = width < 700;
    const { page, ctx } = await makePage({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    await seek(page, 0.44);
    await page.waitForTimeout(2600);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      canvas: document.querySelector("canvas").getBoundingClientRect().toJSON(),
      controls: document
        .querySelector("footer")
        .getBoundingClientRect()
        .toJSON(),
    }));
    check(`${width}×${height}: no horizontal overflow`, !layout.overflow);
    check(
      `${width}×${height}: canvas and controls fit`,
      layout.canvas.width === width &&
        layout.controls.bottom <= height &&
        layout.controls.top >= 0,
    );
    evidence.viewports.push({ width, height, layout, state: await diag(page) });
    if (mobile) {
      const before = (await diag(page)).progress;
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: width / 2, y: height * 0.3 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: width / 2, y: height * 0.18 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(500);
      check(
        `${width}px: touch swipe moves camera`,
        (await diag(page)).progress > before,
      );
    }
    await shot(page, `${width}-reef`);
    await seek(page, 0);
    await shot(page, `${width}-coast`);
    await ctx.close();
  }
  const reduced = await makePage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  check(
    "reduced motion starts paused",
    (await diag(reduced.page)).reducedMotion &&
      !(await diag(reduced.page)).running,
  );
  await reduced.ctx.close();
  check(
    "no JavaScript or shader console errors",
    evidence.consoleErrors.length === 0,
  );
  check("no failed HTTP asset requests", evidence.failedRequests.length === 0);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
  console.log(`Evidence: ${out}/results.json`);
}
