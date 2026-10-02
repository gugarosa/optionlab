// @ts-check
import assert from "node:assert/strict";
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { clickPreview, launchBrowser } from "./browser.js";
import { build } from "../../lib/build.js";

test(
  "capture the fictional Lumen lab for the README and review",
  { skip: process.env.UPDATE_SHOTS !== "1" },
  async () => {
    const built = await build(resolve("examples/lumen/optionlab.json"));
    const browser = await launchBrowser();
    const media = resolve("media");
    const downloads = join(homedir(), "Downloads", "optionlab");
    await Promise.all([mkdir(media, { recursive: true }), mkdir(downloads, { recursive: true })]);
    try {
      for (const [name, route, width] of [
        ["start", "#/start", 1600],
        ["lab", "#/d/hero/b", 1600],
        ["compare", "#/d/hero/b", 1600],
        ["questions", "#/questions", 1600],
        ["words", "#/words", 1600],
        ["inspect", "#/inspect", 1600],
        ["journeys", "#/journeys/first-note", 1600],
        ["desktop", "#/d/hero/b", 1440],
        ["user-1280", "#/d/hero/b", 1280],
        ["mobile", "#/d/hero/b", 390],
        ["mobile-inspect", "#/inspect", 390],
        ["mobile-journeys", "#/journeys/first-note", 390],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height: width < 900 ? 844 : 1050 },
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(pathToFileURL(built.output).href + route);
        if (name === "compare") await page.locator("[data-action=beside]").click();
        if (name.endsWith("inspect")) {
          await page.getByLabel("Inspect route").selectOption("1");
          await page.locator(".inventory [data-name='Plan card']").waitFor();
          await clickPreview(page, page.locator(".frame-card iframe"), ".plan h2");
          await page.locator(".selected-text").waitFor();
        }
        for (const card of await page.locator(".frame-card").all()) {
          await card.scrollIntoViewIfNeeded();
          await page.waitForFunction(
            (element) => element.getAttribute("aria-busy") === "false",
            await card.elementHandle(),
          );
          assert.equal(await card.locator(".frame-status").isHidden(), true);
        }
        await page.evaluate(async () => {
          scrollTo(0, 0);
          await document.fonts.ready;
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.deepEqual(errors, []);
        const path = join(downloads, `${name}.png`);
        await page.screenshot({
          path,
          fullPage: name !== "mobile-journeys",
          animations: "disabled",
          caret: "hide",
        });
        if (name === "mobile-journeys") {
          for (let index = 0; index < 4; index++) {
            const step = page.locator(".journey-step").nth(index);
            await step.scrollIntoViewIfNeeded();
            await page.evaluate(
              () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
            );
            await step.screenshot({
              path: join(downloads, `mobile-journey-step-${index + 1}.png`),
              animations: "disabled",
              caret: "hide",
            });
          }
        }
        if (["lab", "inspect", "journeys", "mobile"].includes(name))
          await copyFile(path, join(media, `${name}.png`));
        await context.close();
      }
      await copyFile(built.output, join(downloads, "lab.html"));
    } finally {
      await browser.close();
    }
  },
);
