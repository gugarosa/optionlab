// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { clickPreview, launchBrowser } from "./browser.js";
import { build } from "../../lib/build.js";

let browser, directory, lab;
before(async () => {
  browser = await launchBrowser();
  directory = await mkdtemp(join(tmpdir(), "prismal-inspect-"));
  const result = await build(resolve("examples/lumen/prismal.json"), {
    output: join(directory, "lab.html"),
  });
  lab = pathToFileURL(result.output).href;
});
after(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function ready(page, card) {
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (node) => node.getAttribute("aria-busy") === "false",
    await card.elementHandle(),
  );
  assert.equal(await card.locator(".frame-status").isHidden(), true);
}
test("Inspect selects named instances, blocks page actions, and exports element feedback", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${lab}#/words`);
  await page.locator('[data-action="inspect-route"][data-route="1"]').click();
  await page.locator(".inventory [data-name='Plan card']").waitFor();
  assert.equal(await page.getByLabel("Inspect route").inputValue(), "1");
  const frame = page.locator(".frame-card iframe").contentFrame();
  await clickPreview(page, page.locator(".frame-card iframe"), ".plan h2");
  await page.waitForFunction(() => document.querySelector(".selection-head h2")?.textContent === "Plan card");
  assert.match(await page.locator(".selected-text").textContent(), /Free/);
  await clickPreview(page, page.locator(".frame-card iframe"), ".start-trial");
  assert.equal(await frame.locator(".feedback").textContent(), "");
  await page.getByRole("button", { name: "Change", exact: true }).focus();
  await page.getByRole("button", { name: "Change", exact: true }).press("Enter");
  assert.equal(
    await page
      .getByRole("button", { name: "Change", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.locator('textarea[data-note="elements"]').fill("Make the price easier to scan.");
  await page.getByRole("button", { name: "Next", exact: true }).focus();
  await page.getByRole("button", { name: "Next", exact: true }).press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".instance-controls > span")?.textContent === "2 of 3",
  );
  assert.match(await page.locator(".selected-text").textContent(), /Plus/);
  assert.equal(
    await page
      .getByRole("button", { name: "Next", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Next", exact: true }).press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".instance-controls > span")?.textContent === "3 of 3",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Previous", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Previous", exact: true }).press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".instance-controls > span")?.textContent === "2 of 3",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".instance-controls > span")?.textContent === "1 of 3",
  );
  assert.equal(
    await page.locator('textarea[data-note="elements"]').inputValue(),
    "Make the price easier to scan.",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.locator(".rail [data-action=export]").click();
  const exported = JSON.parse(await readFile(await (await downloadEvent).path(), "utf8"));
  assert.deepEqual(
    exported.elements.map(({ name, route, index, verdict, note }) => ({ name, route, index, verdict, note })),
    [
      {
        name: "Plan card",
        route: "#/pricing",
        index: 0,
        verdict: "change",
        note: "Make the price easier to scan.",
      },
      { name: "Plan card", route: "#/pricing", index: 1, verdict: "clear", note: "" },
    ],
  );
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await ready(page, page.locator(".frame-card"));
  assert.equal(await page.locator(".bezel").count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  await page.close();
});
test("specificity, explicit names and accessible fallback names work without intercepting when off", async () => {
  const source =
    '<!doctype html><style>body{margin:24px}button{padding:12px;margin:12px}</style><button class="action" id="actual" data-prismal-name="Explicit">Start free trial</button><button id="plain">Continue</button><div data-prismal-name="Helper text"><p>Some useful context.</p></div><script>window.counts={pointerdown:0,mousedown:0,click:0};for(const type of Object.keys(counts))document.addEventListener(type,()=>counts[type]++);window.instance=Math.random();</script>';
  await writeFile(join(directory, "named.html"), source);
  const manifest = join(directory, "named.json");
  await writeFile(
    manifest,
    JSON.stringify({
      title: "Names",
      round: 1,
      decisions: [],
      elements: [
        { name: "Generic", selector: "button.action" },
        { name: "Specific", selector: ":is(#actual,.unused)" },
        { name: "Low weight", selector: ":where(#actual)" },
      ],
      inspect: [{ label: "Names", file: "named.html" }],
    }),
  );
  const result = await build(manifest, { output: join(directory, "named-lab.html") });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`${pathToFileURL(result.output).href}#/inspect`);
  await ready(page, page.locator(".frame-card"));
  await page.locator(".inventory [data-name='Specific']").waitFor();
  const frame = page.locator(".frame-card iframe").contentFrame();
  await clickPreview(page, page.locator(".frame-card iframe"), "#actual");
  await page.waitForFunction(() => document.querySelector(".selection-head h2")?.textContent === "Specific");
  assert.deepEqual(await frame.locator("body").evaluate(() => window.counts), {
    pointerdown: 0,
    mousedown: 0,
    click: 0,
  });
  await clickPreview(page, page.locator(".frame-card iframe"), "#plain");
  await page.waitForFunction(
    () => document.querySelector(".selection-head h2")?.textContent === 'Button "Continue"',
  );
  await clickPreview(page, page.locator(".frame-card iframe"), "[data-prismal-name='Helper text']");
  await page.waitForFunction(
    () => document.querySelector(".selection-head h2")?.textContent === "Helper text",
  );
  assert.equal(await page.locator(".instance-controls > span").textContent(), "1 of 1");
  const instance = await frame.locator("body").evaluate(() => window.instance);
  await page.getByRole("button", { name: "Inspect on", exact: true }).click();
  await frame.locator("[data-prismal-ring=selection]").waitFor({ state: "hidden" });
  await clickPreview(page, page.locator(".frame-card iframe"), "#actual");
  assert.deepEqual(await frame.locator("body").evaluate(() => window.counts), {
    pointerdown: 1,
    mousedown: 1,
    click: 1,
  });
  assert.equal(await frame.locator("body").evaluate(() => window.instance), instance);
  await page.close();
});
test("journey targets have labeled rings at laptop and phone size; verdicts and notes export", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${lab}#/journeys/first-note`);
  assert.equal(await page.locator(".journey-step").count(), 4);
  const selectors = [".site-nav a[href='#/pricing']", ".plans", ".billing-toggle", ".start-trial"];
  for (const device of ["Laptop", "Phone"]) {
    await page.getByRole("button", { name: device, exact: true }).click();
    for (let index = 0; index < 4; index++) {
      const card = page.locator(".journey-step").nth(index).locator(".frame-card");
      await ready(page, card);
      const frame = card.locator("iframe").contentFrame();
      const ring = frame.locator("[data-prismal-ring=highlight]");
      await ring.waitFor();
      assert.equal(await ring.textContent(), `Step ${index + 1}`);
      const delta = await frame
        .locator(selectors[index])
        .first()
        .evaluate((element) => {
          const target = element.getBoundingClientRect();
          const outline = document.querySelector("[data-prismal-ring=highlight]").getBoundingClientRect();
          return (
            Math.abs(outline.left - Math.max(0, target.left)) +
            Math.abs(outline.top - Math.max(0, target.top))
          );
        });
      assert.ok(delta < 2, `${device} step ${index + 1} ring missed by ${delta}px`);
    }
  }
  await page.locator('[data-action=journey-verdict][data-step="1"][data-value=obvious]').click();
  await page.locator('textarea[data-note=journeys][data-step="1"]').fill("Easy to find.");
  assert.equal(await page.getByRole("progressbar", { name: "Journey steps" }).getAttribute("value"), "1");
  const event = page.waitForEvent("download");
  await page.locator(".rail [data-action=export]").click();
  const exported = JSON.parse(await readFile(await (await event).path(), "utf8"));
  assert.deepEqual(exported.journeys[0], {
    journey: "first-note",
    step: 1,
    title: "Find the plans",
    verdict: "obvious",
    note: "Easy to find.",
  });
  await page.reload();
  assert.equal(
    await page.locator('textarea[data-note=journeys][data-step="1"]').inputValue(),
    "Easy to find.",
  );
  assert.deepEqual(errors, []);
  await page.close();
});
