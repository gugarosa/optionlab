// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { launchBrowser } from "./browser.js";
import { build } from "../../lib/build.js";

let browser, directory, lab;
before(async () => {
  browser = await launchBrowser();
  directory = await mkdtemp(join(tmpdir(), "prismal-review-"));
  const result = await build(resolve("examples/lumen/prismal.json"), {
    output: join(directory, "lab.html"),
  });
  lab = pathToFileURL(result.output).href;
});
after(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("questions, words and notes persist, export, import and reset together", async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${lab}#/questions`);
  await page.getByRole("button", { name: "Monthly", exact: true }).click();
  await page.locator('textarea[data-id="billing"]').fill("Make the interval easy to see.");
  assert.equal(
    await page.getByRole("progressbar", { name: "Questions answered" }).getAttribute("value"),
    "1",
  );
  await page.locator('.rail a[href="#/words"]').click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await page.getByLabel("Other word for Collection").fill("Bundles");
  await page.getByRole("button", { name: 'Keep "Plus"', exact: true }).click();
  await page.locator('textarea[data-id="collection"]').fill("Small groups, not a filing cabinet.");
  assert.equal(await page.getByRole("progressbar", { name: "Words reviewed" }).getAttribute("value"), "3");
  await page.locator('.rail a[href="#/notes"]').click();
  const notes = 'Keep it calm. Literal text: <script>notCode()</script> & "notes".';
  await page.getByLabel("General notes").fill(notes);
  await page.getByLabel("General notes").press("ArrowDown");
  assert.match(page.url(), /#\/notes$/);
  await page.reload();
  assert.equal(await page.getByLabel("General notes").inputValue(), notes);
  const downloaded = page.waitForEvent("download");
  await page.locator(".rail [data-action=export]").click();
  const exported = JSON.parse(await readFile(await (await downloaded).path(), "utf8"));
  assert.deepEqual(exported.questions[0], {
    id: "billing",
    answer: "Monthly",
    note: "Make the interval easy to see.",
  });
  assert.deepEqual(
    exported.words.map((word) => word.choice),
    ["Notebook", "Bundles", "keep"],
  );
  assert.equal(exported.notes, notes);
  await page.getByRole("button", { name: "Reset round", exact: true }).click();
  await page.getByRole("button", { name: "Keep choices", exact: true }).click();
  assert.equal(await page.getByLabel("General notes").inputValue(), notes);
  await page.getByRole("button", { name: "Reset round", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await page.getByLabel("General notes").inputValue(), "");
  assert.equal(await page.getByRole("progressbar", { name: "Words reviewed" }).getAttribute("value"), "0");
  await page.locator("#import-file").setInputFiles({
    name: "other-round.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exported, title: "Another round", round: 2 })),
  });
  await page.waitForFunction(() => document.getElementById("toast").textContent.includes("Another round"));
  assert.equal(await page.getByLabel("General notes").inputValue(), notes);
  await page.locator('.rail a[href="#/words"]').click();
  assert.equal(await page.getByLabel("Other word for Collection").inputValue(), "Bundles");
  assert.equal(
    await page.getByRole("button", { name: "Notebook", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  await page.close();
});
test("review-only rounds expose only defined pages plus Start and Notes", async () => {
  const path = join(directory, "review-only.json");
  await writeFile(
    path,
    JSON.stringify({
      title: "Final details",
      round: 3,
      decisions: [],
      questions: [{ id: "copy", question: "Keep this label?", choices: ["Keep", "Change"] }],
    }),
  );
  const result = await build(path, { output: join(directory, "review-only.html") });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(result.output).href);
  assert.deepEqual(await page.locator(".nav-link").allTextContents(), ["Start", "Questions", "Notes"]);
  assert.equal(
    await page
      .locator(".nav-label")
      .allTextContents()
      .then((text) => text.includes("Decisions")),
    false,
  );
  await page.locator('.rail a[href="#/questions"]').click();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  assert.equal(
    await page.getByRole("progressbar", { name: "Questions answered" }).getAttribute("value"),
    "1",
  );
  await page.close();
});
